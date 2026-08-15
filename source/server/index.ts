import express, { Express, Request, Response } from 'express'
import { createServer } from 'http'
import dotenv from 'dotenv'
import { deleteSession, type ChatStreamChunk } from '../../core-lib/index.js'
import { tokenConfigPath } from '../core/TokenConfig.js'
import { getAIResponse, getChatSystemPrompt } from '../actions/agent.js'
import { getCurrentSessionId, resetChatSession, stopCurrentGeneration } from '../core/apiClient.js'

// Load token from config file
dotenv.config({ path: tokenConfigPath, quiet: true })

export interface ServerOptions {
	port?: number
	host?: string
}

interface ChatCompletionRequest {
	model?: string
	messages: Array<{ role: string; content: string }>
	stream?: boolean
	session_id?: string
	thinking_enabled?: boolean
	search_enabled?: boolean
	temperature?: number
	max_tokens?: number
}

interface ConversationRequest {
	metadata?: { [key: string]: string }
}

interface ChatCompletionResponse {
	id: string
	object: string
	created: number
	model: string
	choices: Array<{
		index: number
		message: {
			role: string
			content: string
		}
		finish_reason: string | null
	}>
	usage?: {
		prompt_tokens: number
		completion_tokens: number
		total_tokens: number
	}
}

function generateId(): string {
	return 'chatcmpl-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}

function getToken(): string {
	// Read token from env or config
	const token = process.env['DEEPSEEK_TOKEN'] || process.env['RC_TOKEN']
	if (!token) {
		throw new Error('No token found. Set DEEPSEEK_TOKEN or RC_TOKEN environment variable.')
	}
	return token
}

function getServeSystemPrompt(): string {
	return `${getChatSystemPrompt()}\n\nHTTP serve mode is inference-only. Do not request or invoke tools; answer directly.`
}

function sendError(res: Response, status: number, message: string, code: string | null = null): void {
	res.status(status).json({
		error: {
			message,
			type: status >= 500 ? 'server_error' : 'invalid_request_error',
			param: null,
			code,
		},
	})
}

export async function startServer(options: ServerOptions = {}): Promise<void> {
	const port = options.port || parseInt(process.env['PORT'] || '3000', 10)
	const host = options.host || process.env['HOST'] || '0.0.0.0'

	const app: Express = express()
	app.use(express.json({ limit: '10mb' }))

	// Health check
	app.get('/health', (_req: Request, res: Response) => {
		res.json({ status: 'ok', timestamp: new Date().toISOString() })
	})

	// Start a fresh DeepSeek conversation and initialize it with the CLI system prompt.
	const createConversation = async (req: Request, res: Response) => {
		try {
			const body = req.body as ConversationRequest
			const token = getToken()
			const previousSessionId = getCurrentSessionId()

			await stopCurrentGeneration(token)
			if (previousSessionId) {
				await deleteSession(token, previousSessionId)
			}

			resetChatSession()
			const result = await getAIResponse({
				token,
				prompt: getServeSystemPrompt(),
				thinkingEnabled: false,
				searchEnabled: false,
				toolsEnabled: false,
			})

			res.json({
				id: result.sessionId,
				object: 'conversation',
				created_at: Math.floor(Date.now() / 1000),
				metadata: body.metadata ?? {},
			})
		} catch (error: any) {
			console.error('Failed to create conversation:', error)
			sendError(res, 500, error.message || 'Failed to create conversation')
		}
	}

	app.post('/v1/conversations', createConversation)
	app.post('/v1/conversations/new', createConversation)

	// OpenAI compatible endpoint using agent
	app.post('/v1/chat/completions', async (req: Request, res: Response) => {
		try {
			const body = req.body as ChatCompletionRequest

			// Validate required fields
			if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
				sendError(res, 400, 'messages is required and must be a non-empty array', 'invalid_messages')
				return
			}

			// Extract the last user message as prompt
			const lastMessage = body.messages[body.messages.length - 1]
			if (lastMessage?.role !== 'user') {
				sendError(res, 400, 'The last message must be from the user', 'invalid_messages')
				return
			}

			const prompt = lastMessage.content
			const token = getToken()
			const thinkingEnabled = body.thinking_enabled ?? false
			const searchEnabled = body.search_enabled ?? false
			const stream = body.stream === true
			const completionId = generateId()
			const completionCreated = Math.floor(Date.now() / 1000)
			const responseModel = body.model || 'deepseek-chat'

			// Stop the upstream generation only when the response connection closes
			// prematurely. The request's `close` event can fire after Express has read
			// the request body, even though the client is still waiting for a response.
			let generationStarted = false
			let clientDisconnected = false

			res.on('close', () => {
				if (!res.writableEnded) {
					clientDisconnected = true
				}

				if (clientDisconnected && generationStarted) {
					console.log('Client disconnected, stopping generation...')
					stopCurrentGeneration(token).catch(console.error)
				}
			})

			// For streaming, we need to send SSE headers
			if (stream) {
				res.setHeader('Content-Type', 'text/event-stream')
				res.setHeader('Cache-Control', 'no-cache')
				res.setHeader('Connection', 'keep-alive')
				res.flushHeaders()
				res.write(
					`data: ${JSON.stringify({
						id: completionId,
						object: 'chat.completion.chunk',
						created: completionCreated,
						model: responseModel,
						choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
					})}\n\n`
				)
			}

			// We'll accumulate content for non-streaming
			let fullContent = ''
			let fullThinking = ''

			// onChunk callback
			const onChunk = (chunk: ChatStreamChunk) => {
				if (chunk.type === 'response') {
					fullContent += chunk.content
					if (stream && !clientDisconnected) {
						const data = {
							id: completionId,
							object: 'chat.completion.chunk',
							created: completionCreated,
							model: responseModel,
							choices: [
								{
									index: 0,
									delta: { content: chunk.content },
									finish_reason: null,
								},
							],
						}
						res.write(`data: ${JSON.stringify(data)}\n\n`)
					}
				} else if (chunk.type === 'thinking') {
					fullThinking += chunk.content
					// Optionally send thinking as delta? Not standard; we'll skip for now.
				}
			}

			// Initialize the DeepSeek session with the same system prompt used by the CLI.
			generationStarted = true
			await getAIResponse({
				token,
				prompt: getServeSystemPrompt(),
				thinkingEnabled,
				searchEnabled,
				toolsEnabled: false,
			})

			if (clientDisconnected) return

			// Send the user's prompt after the system prompt has established the session.
			const result = await getAIResponse({
				token,
				prompt,
				thinkingEnabled,
				searchEnabled,
				onChunk,
				toolsEnabled: false,
			})
			generationStarted = false

			if (clientDisconnected) return

			// After generation completes
			if (result.stopped) {
				// If stopped due to abort or client disconnect
				if (stream) {
					const finalData = {
						id: completionId,
						object: 'chat.completion.chunk',
						created: completionCreated,
						model: responseModel,
						choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
					}
					res.write(`data: ${JSON.stringify(finalData)}\n\n`)
					res.write('data: [DONE]\n\n')
					res.end()
				} else {
					res.status(504).json({
						error: 'Request timed out or was aborted',
						message: 'The request was interrupted.',
					})
				}
				return
			}

			if (!result.ok) {
				const errorMessage = result.error || 'Unknown error from DeepSeek API'
				if (stream) {
					const errorData = {
						id: completionId,
						object: 'chat.completion.chunk',
						created: completionCreated,
						model: responseModel,
						choices: [{ index: 0, delta: {}, finish_reason: 'error' }],
						error: errorMessage,
						bizCode: result.bizCode,
					}
					res.write(`data: ${JSON.stringify(errorData)}\n\n`)
					res.write('data: [DONE]\n\n')
					res.end()
				} else {
					res.status(500).json({
						error: errorMessage,
						bizCode: result.bizCode,
					})
				}
				return
			}

			// Success
			if (stream) {
				// Send final chunk with usage if available
				const finalData: any = {
					id: completionId,
					object: 'chat.completion.chunk',
					created: completionCreated,
					model: responseModel,
					choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
				}
				if (result.tokenUsage) {
					finalData.usage = {
						prompt_tokens: result.tokenUsage.prompt_tokens || 0,
						completion_tokens: result.tokenUsage.completion_tokens || 0,
						total_tokens: result.tokenUsage.total_tokens || 0,
					}
				}
				res.write(`data: ${JSON.stringify(finalData)}\n\n`)
				res.write('data: [DONE]\n\n')
				res.end()
			} else {
				// Build non-streaming response
				const response: ChatCompletionResponse = {
					id: completionId,
					object: 'chat.completion',
					created: completionCreated,
					model: responseModel,
					choices: [
						{
							index: 0,
							message: {
								role: 'assistant',
								content: fullContent || result.content || '',
							},
							finish_reason: 'stop',
						},
					],
				}
				if (result.tokenUsage) {
					response.usage = {
						prompt_tokens: result.tokenUsage.prompt_tokens || 0,
						completion_tokens: result.tokenUsage.completion_tokens || 0,
						total_tokens: result.tokenUsage.total_tokens || 0,
					}
				}
				res.json(response)
			}
		} catch (error: any) {
			console.error('Request error:', error)
			if (!res.headersSent) {
				sendError(res, 500, error.message || 'Internal server error')
			} else {
				res.end()
			}
		}
	})

	const server = createServer(app)

	server.listen(port, host, () => {
		console.log(`🚀 RP-CLI HTTP server running on http://${host}:${port}`)
		console.log(`📡 OpenAI-compatible endpoint: http://${host}:${port}/v1/chat/completions`)
		console.log(`🆕 New conversation endpoint: http://${host}:${port}/v1/conversations`)
		console.log(`🔑 Set DEEPSEEK_TOKEN or RC_TOKEN environment variable for authentication`)
	})

	// Graceful shutdown
	process.on('SIGTERM', () => {
		console.log('SIGTERM signal received: closing HTTP server')
		server.close(() => {
			console.log('HTTP server closed')
			process.exit(0)
		})
	})

	process.on('SIGINT', () => {
		console.log('SIGINT signal received: closing HTTP server')
		server.close(() => {
			console.log('HTTP server closed')
			process.exit(0)
		})
	})
}
