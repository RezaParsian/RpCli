import { createServer } from 'http'
import dotenv from 'dotenv'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { type ChatStreamChunk } from '../../core-lib/index.js'
import { getCurrentSessionId, stopCurrentGeneration } from '../core/apiClient.js'
import { tokenConfigPath } from '../core/TokenConfig.js'
import { ApiError, errorBody, sendError, toApiError } from './errors.js'
import { cors, getToken } from './http.js'
import {
	buildCompletionPrompt,
	generateCompletionId,
	parseClientToolCalls,
	resolveModel,
	resolveThinkingEnabled,
	toUsage,
	validateTools,
	withToolInstructions,
} from './request.js'
import { enqueueCompletion, getSessionTools, rememberSessionTools, runCompletion } from './session.js'
import { streamChunk, writeSse } from './stream.js'
import { type ChatCompletionRequest, type ServerOptions } from './types.js'

export type { ServerOptions } from './types.js'

dotenv.config({ path: tokenConfigPath, quiet: true })

export async function startServer(options: ServerOptions = {}): Promise<void> {
	const parsedPort = options.port ?? Number.parseInt(process.env['PORT'] || '3000', 10)
	const port = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65_535 ? parsedPort : 3000
	const host = options.host || process.env['HOST'] || '127.0.0.1'
	const displayHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host

	const app: Express = express()
	app.use(cors)
	app.use(express.json({ limit: '10mb' }))
	app.options('*', (_req: Request, res: Response) => {
		res.status(204).end()
	})

	app.get('/health', (_req: Request, res: Response) => {
		res.json({ status: 'ok', object: 'health', timestamp: new Date().toISOString() })
	})

	app.post(['/v1/chat/completions', '/v1/chat/completions/:sessionId'], async (req: Request, res: Response) => {
		let clientDisconnected = false
		res.on('close', () => {
			if (!res.writableEnded) clientDisconnected = true
		})

		try {
			const body = (req.body ?? {}) as ChatCompletionRequest
			if (!Array.isArray(body.messages) || body.messages.length === 0) {
				throw new ApiError(
					400,
					"'messages' is a required property",
					'invalid_request_error',
					'invalid_messages',
					'messages'
				)
			}

			if (body.n != null && body.n !== 1) {
				throw new ApiError(400, 'Only n=1 is supported', 'invalid_request_error', 'unsupported_value', 'n')
			}

			const token = getToken(req)
			const requestedSessionId = req.params['sessionId']
			const sessionId = typeof requestedSessionId === 'string' ? requestedSessionId.trim() : undefined
			if (requestedSessionId !== undefined && !sessionId) {
				throw new ApiError(400, 'Session ID cannot be empty', 'invalid_request_error', 'invalid_session_id', 'sessionId')
			}
			const cachedTools = getSessionTools(sessionId ?? getCurrentSessionId())
			const submittedTools = body.tools === undefined ? undefined : validateTools(body.tools)
			const tools = submittedTools ?? cachedTools ?? []
			const toolsChanged = submittedTools !== undefined && JSON.stringify(submittedTools) !== JSON.stringify(cachedTools)
			const prompt = withToolInstructions(buildCompletionPrompt(body.messages), tools, body.tool_choice, toolsChanged)

			const resolved = resolveModel(body.model)
			const thinkingEnabled = resolveThinkingEnabled(body, resolved.thinkingEnabled)
			const searchEnabled = body.search_enabled ?? false
			const stream = body.stream === true
			const includeUsage = body.stream_options?.include_usage === true
			const completionId = generateCompletionId()
			const created = Math.floor(Date.now() / 1000)
			const responseModel = body.model || resolved.id
			const toolCallingEnabled = tools.length > 0 && body.tool_choice !== 'none'
			const deferStreamForTools = stream && toolCallingEnabled
			let fullContent = ''
			let fullThinking = ''
			let streamStarted = false

			const setSessionHeader = (activeSessionId: string | undefined) => {
				if (activeSessionId && !res.headersSent) res.setHeader('X-RP-Session-Id', activeSessionId)
			}

			const startStream = () => {
				if (!stream || streamStarted) return
				setSessionHeader(getCurrentSessionId())
				streamChunk(res, completionId, created, responseModel, { role: 'assistant', content: '' })
				streamStarted = true
			}

			const onChunk = (chunk: ChatStreamChunk) => {
				if (chunk.type === 'thinking') {
					fullThinking += chunk.content
					if (stream && !deferStreamForTools && !clientDisconnected && chunk.content) {
						startStream()
						streamChunk(res, completionId, created, responseModel, { reasoning_content: chunk.content })
					}
					return
				}

				fullContent += chunk.content
				if (stream && !deferStreamForTools && !clientDisconnected && chunk.content) {
					startStream()
					streamChunk(res, completionId, created, responseModel, { content: chunk.content })
				}
			}

			if (stream) {
				res.status(200)
				res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
				res.setHeader('Cache-Control', 'no-cache, no-transform')
				res.setHeader('Connection', 'keep-alive')
				res.setHeader('X-Accel-Buffering', 'no')
			}

			const result = await enqueueCompletion(async () => {
				if (clientDisconnected) return { stopped: true, ok: true, sessionId: '', content: '', thinkingContent: '' }
				try {
					return await runCompletion({
						token,
						sessionId,
						prompt,
						thinkingEnabled,
						searchEnabled,
						onChunk,
						shouldAbort: () => clientDisconnected,
					})
				} finally {
					if (clientDisconnected) await stopCurrentGeneration(token).catch(() => undefined)
				}
			})

			if (clientDisconnected) return
			setSessionHeader(result.sessionId)
			if (submittedTools !== undefined) rememberSessionTools(result.sessionId, submittedTools)
			if (result.stopped) {
				if (stream) {
					startStream()
					streamChunk(res, completionId, created, responseModel, {}, 'stop')
					res.write('data: [DONE]\n\n')
					res.end()
					return
				}
				throw new ApiError(504, 'The request was interrupted.', 'server_error', 'timeout')
			}

			if (!result.ok) throw new ApiError(500, result.error || 'The model produced an error.', 'server_error')

			const rawContent = fullContent || result.content || ''
			const parsedToolResponse = toolCallingEnabled ? parseClientToolCalls(rawContent) : { content: rawContent, calls: [] }
			for (const call of parsedToolResponse.calls) {
				if (!tools.some((tool) => tool.function.name === call.function.name)) {
					throw new ApiError(
						500,
						`The model requested an unknown function: ${call.function.name}`,
						'server_error',
						'unknown_tool'
					)
				}
			}

			if (body.tool_choice === 'required' && parsedToolResponse.calls.length === 0) {
				throw new ApiError(
					500,
					'The model did not produce a required function call',
					'server_error',
					'tool_call_required'
				)
			}

			const requiredToolName =
				typeof body.tool_choice === 'object' && body.tool_choice !== null ? body.tool_choice.function.name : undefined
			if (requiredToolName && parsedToolResponse.calls.some((call) => call.function.name !== requiredToolName)) {
				throw new ApiError(
					500,
					'The model called a function other than the required function',
					'server_error',
					'invalid_tool_call'
				)
			}

			const content = parsedToolResponse.content
			const toolCalls = parsedToolResponse.calls
			const reasoning = fullThinking || result.thinkingContent || ''
			const usage = toUsage(result.tokenUsage)

			if (stream) {
				startStream()
				if (deferStreamForTools) {
					if (reasoning) streamChunk(res, completionId, created, responseModel, { reasoning_content: reasoning })
					if (content) streamChunk(res, completionId, created, responseModel, { content })
					if (toolCalls.length > 0) {
						streamChunk(res, completionId, created, responseModel, {
							tool_calls: toolCalls.map((call, index) => ({ index, ...call })),
						})
					}
				}

				streamChunk(res, completionId, created, responseModel, {}, toolCalls.length > 0 ? 'tool_calls' : 'stop')
				if (includeUsage) {
					writeSse(res, {
						id: completionId,
						object: 'chat.completion.chunk',
						created,
						model: responseModel,
						system_fingerprint: null,
						choices: [],
						usage: usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
					})
				}

				res.write('data: [DONE]\n\n')
				res.end()
				return
			}

			res.json({
				id: completionId,
				object: 'chat.completion',
				created,
				model: responseModel,
				system_fingerprint: null,
				choices: [
					{
						index: 0,
						message: {
							role: 'assistant',
							content: toolCalls.length > 0 && !content ? null : content,
							...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
							...(thinkingEnabled || reasoning ? { reasoning_content: reasoning || null } : {}),
							refusal: null,
						},
						logprobs: null,
						finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
					},
				],
				usage: usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
			})
		} catch (error: unknown) {
			const apiError = toApiError(error)
			if (apiError.status >= 500) console.error('Request error:', error)
			if (res.headersSent) {
				writeSse(res, errorBody(apiError))
				res.write('data: [DONE]\n\n')
				res.end()
				return
			}
			sendError(res, apiError)
		}
	})

	app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
		if (error instanceof SyntaxError) {
			sendError(
				res,
				new ApiError(
					400,
					`We could not parse the JSON body of your request: ${error.message}`,
					'invalid_request_error',
					'invalid_json'
				)
			)
			return
		}
		sendError(res, toApiError(error))
	})

	app.use((req: Request, res: Response) => {
		sendError(res, new ApiError(404, `Invalid URL (${req.method} ${req.path})`, 'invalid_request_error', 'invalid_url'))
	})

	const server = createServer(app)
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject)
		server.listen(port, host, () => {
			server.removeListener('error', reject)
			console.log(`RP-CLI OpenAI-compatible API listening on http://${displayHost}:${port}/v1`)
			console.log(`  POST /v1/chat/completions`)
			console.log(`  POST /v1/chat/completions/:sessionId`)
			resolve()
		})
	})

	const shutdown = () => {
		console.log('Closing HTTP server')
		server.close(() => {
			process.exit(0)
		})
	}

	process.on('SIGTERM', shutdown)
	process.on('SIGINT', shutdown)
}
