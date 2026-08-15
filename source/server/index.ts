import { createServer } from 'http'
import crypto from 'node:crypto'
import dotenv from 'dotenv'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { deleteSession, isInvalidTokenError, type ChatStreamChunk } from '../../core-lib/index.js'
import { getAIResponse } from '../actions/agent.js'
import { getCurrentSessionId, resetChatSession, stopCurrentGeneration } from '../core/apiClient.js'
import { tokenConfigPath } from '../core/TokenConfig.js'

dotenv.config({ path: tokenConfigPath, quiet: true })

export type ServerOptions = {
	port?: number
	host?: string
}

type ChatMessageContent =
	| string
	| Array<string | { type?: string; text?: string }>
	| null

type ChatMessage = {
	role?: string
	content?: ChatMessageContent
	name?: string
}

type ChatCompletionRequest = {
	model?: string
	messages?: ChatMessage[]
	stream?: boolean
	stream_options?: { include_usage?: boolean }
	n?: number
	thinking_enabled?: boolean
	search_enabled?: boolean
	temperature?: number
	max_tokens?: number
}

type CompletionUsage = {
	prompt_tokens: number
	completion_tokens: number
	total_tokens: number
}

const MODELS = [
	{ id: 'deepseek-chat', owned_by: 'deepseek' },
	{ id: 'deepseek-reasoner', owned_by: 'deepseek' },
] as const

const MODEL_CREATED = 1_704_067_200

let completionQueue: Promise<void> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
	const run = completionQueue.then(task, task)
	completionQueue = run.then(
		() => undefined,
		() => undefined
	)
	return run
}

function generateId(): string {
	return `chatcmpl-${crypto.randomBytes(12).toString('hex')}`
}

function extractBearer(req: Request): string | undefined {
	const header = req.header('authorization')
	if (!header) return undefined

	const match = /^Bearer\s+(\S+)/i.exec(header)
	return match?.[1]
}

function getToken(req: Request): string {
	const configured = process.env['DEEPSEEK_TOKEN'] || process.env['RC_TOKEN']
	if (configured) return configured

	const bearer = extractBearer(req)
	if (bearer) return bearer

	throw new ApiError(
		401,
		"You didn't provide an API key. Set DEEPSEEK_TOKEN or pass Authorization: Bearer <token>.",
		'invalid_request_error',
		'invalid_api_key'
	)
}

function modelRecord(id: string) {
	return {
		id,
		object: 'model' as const,
		created: MODEL_CREATED,
		owned_by: MODELS.find((model) => model.id === id)?.owned_by ?? 'deepseek',
	}
}

function resolveModel(model: string | undefined): { id: string; thinkingEnabled: boolean } {
	if (!model || model === 'deepseek-chat') {
		return { id: 'deepseek-chat', thinkingEnabled: false }
	}

	if (model === 'deepseek-reasoner' || /reasoner|\br1\b/i.test(model)) {
		return { id: model, thinkingEnabled: true }
	}

	return { id: model, thinkingEnabled: false }
}

function messageText(content: ChatMessageContent | undefined): string {
	if (content == null) return ''
	if (typeof content === 'string') return content
	if (!Array.isArray(content)) return String(content)

	return content
		.map((part) => {
			if (typeof part === 'string') return part
			if (part && typeof part.text === 'string') return part.text
			return ''
		})
		.filter(Boolean)
		.join('\n')
}

function buildCompletionPrompt(messages: ChatMessage[]): string {
	const normalized = messages
		.map((message) => ({
			role: (message.role || 'user').toLowerCase(),
			content: messageText(message.content).trim(),
		}))
		.filter((message) => message.content.length > 0)

	if (normalized.length === 0) {
		throw new ApiError(
			400,
			"'messages' must contain at least one message with content",
			'invalid_request_error',
			'invalid_messages',
			'messages'
		)
	}

	const dialogue = normalized.filter((message) => message.role !== 'system' && message.role !== 'developer')
	if (dialogue.length === 0) {
		throw new ApiError(
			400,
			"'messages' must include a user message",
			'invalid_request_error',
			'invalid_messages',
			'messages'
		)
	}

	if (normalized.length === 1 && dialogue[0]?.role === 'user') {
		return dialogue[0].content
	}

	return normalized
		.map((message) => {
			const role = message.role === 'developer' ? 'system' : message.role
			return `${role}:\n${message.content}`
		})
		.join('\n\n')
}

function toUsage(tokenUsage: unknown): CompletionUsage | undefined {
	if (!tokenUsage || typeof tokenUsage !== 'object') return undefined

	const usage = tokenUsage as Record<string, unknown>
	const promptTokens = Number(usage['prompt_tokens'] ?? usage['input_tokens'] ?? 0) || 0
	const completionTokens = Number(usage['completion_tokens'] ?? usage['output_tokens'] ?? 0) || 0
	const totalTokens = Number(usage['total_tokens'] ?? usage['total'] ?? promptTokens + completionTokens) || 0

	if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) return undefined

	return {
		prompt_tokens: promptTokens,
		completion_tokens: completionTokens,
		total_tokens: totalTokens,
	}
}

class ApiError extends Error {
	status: number
	type: string
	code: string | null
	param: string | null

	constructor(status: number, message: string, type: string, code: string | null = null, param: string | null = null) {
		super(message)
		this.name = 'ApiError'
		this.status = status
		this.type = type
		this.code = code
		this.param = param
	}
}

function errorBody(error: ApiError) {
	return {
		error: {
			message: error.message,
			type: error.type,
			param: error.param,
			code: error.code,
		},
	}
}

function sendError(res: Response, error: ApiError): void {
	if (res.headersSent) {
		res.end()
		return
	}

	res.status(error.status).json(errorBody(error))
}

function toApiError(error: unknown): ApiError {
	if (error instanceof ApiError) return error
	if (isInvalidTokenError(error)) {
		return new ApiError(401, 'Invalid API key provided.', 'invalid_request_error', 'invalid_api_key')
	}

	const message = error instanceof Error ? error.message : String(error)
	return new ApiError(500, message || 'Internal server error', 'server_error')
}

function cors(_req: Request, res: Response, next: NextFunction): void {
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
	res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, OpenAI-Beta')
	res.setHeader('Access-Control-Max-Age', '86400')
	next()
}

function writeSse(res: Response, payload: unknown): void {
	res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function streamChunk(
	res: Response,
	id: string,
	created: number,
	model: string,
	delta: Record<string, unknown>,
	finishReason: string | null = null
): void {
	writeSse(res, {
		id,
		object: 'chat.completion.chunk',
		created,
		model,
		system_fingerprint: null,
		choices: [
			{
				index: 0,
				delta,
				logprobs: null,
				finish_reason: finishReason,
			},
		],
	})
}

async function runIsolatedCompletion(options: {
	token: string
	prompt: string
	thinkingEnabled: boolean
	searchEnabled: boolean
	onChunk?: (chunk: ChatStreamChunk) => void
	shouldAbort: () => boolean
}) {
	await stopCurrentGeneration(options.token)
	const previousSessionId = getCurrentSessionId()
	if (previousSessionId) {
		await deleteSession(options.token, previousSessionId).catch(() => undefined)
	}

	resetChatSession()

	try {
		if (options.shouldAbort()) {
			return { stopped: true, ok: true, sessionId: '', content: '', thinkingContent: '' }
		}

		return await getAIResponse({
			token: options.token,
			prompt: options.prompt,
			thinkingEnabled: options.thinkingEnabled,
			searchEnabled: options.searchEnabled,
			onChunk: options.onChunk,
			toolsEnabled: false,
		})
	} finally {
		// const sessionId = getCurrentSessionId()
		resetChatSession()
		// if (sessionId) {
			// await deleteSession(options.token, sessionId).catch(() => undefined)
		// }
	}
}

export async function startServer(options: ServerOptions = {}): Promise<void> {
	const parsedPort = options.port ?? Number.parseInt(process.env['PORT'] || '3000', 10)
	const port = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65_535 ? parsedPort : 3000
	const host = options.host || process.env['HOST'] || '0.0.0.0'
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

	app.get(['/v1/models', '/models'], (_req: Request, res: Response) => {
		res.json({
			object: 'list',
			data: MODELS.map((model) => modelRecord(model.id)),
		})
	})

	app.get(['/v1/models/:id', '/models/:id'], (req: Request, res: Response) => {
		const id = req.params['id']
		res.json(modelRecord(typeof id === 'string' ? id : id?.[0] ?? 'deepseek-chat'))
	})

	app.post(['/v1/chat/completions', '/chat/completions'], async (req: Request, res: Response) => {
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

			const prompt = buildCompletionPrompt(body.messages)
			const token = getToken(req)
			const resolved = resolveModel(body.model)
			const thinkingEnabled = body.thinking_enabled ?? resolved.thinkingEnabled
			const searchEnabled = body.search_enabled ?? false
			const stream = body.stream === true
			const includeUsage = body.stream_options?.include_usage === true
			const completionId = generateId()
			const created = Math.floor(Date.now() / 1000)
			const responseModel = body.model || resolved.id

			let fullContent = ''
			let fullThinking = ''

			const onChunk = (chunk: ChatStreamChunk) => {
				if (chunk.type === 'thinking') {
					fullThinking += chunk.content
					if (stream && !clientDisconnected && chunk.content) {
						streamChunk(res, completionId, created, responseModel, { reasoning_content: chunk.content })
					}

					return
				}

				fullContent += chunk.content
				if (stream && !clientDisconnected && chunk.content) {
					streamChunk(res, completionId, created, responseModel, { content: chunk.content })
				}
			}

			if (stream) {
				res.status(200)
				res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
				res.setHeader('Cache-Control', 'no-cache, no-transform')
				res.setHeader('Connection', 'keep-alive')
				res.setHeader('X-Accel-Buffering', 'no')
				res.flushHeaders()
				streamChunk(res, completionId, created, responseModel, { role: 'assistant', content: '' })
			}

			const result = await enqueue(async () => {
				if (clientDisconnected) {
					return { stopped: true, ok: true, sessionId: '', content: '', thinkingContent: '' }
				}

				try {
					return await runIsolatedCompletion({
						token,
						prompt,
						thinkingEnabled,
						searchEnabled,
						onChunk,
						shouldAbort: () => clientDisconnected,
					})
				} finally {
					if (clientDisconnected) {
						await stopCurrentGeneration(token).catch(() => undefined)
					}
				}
			})

			if (clientDisconnected) return

			if (result.stopped) {
				if (stream) {
					streamChunk(res, completionId, created, responseModel, {}, 'stop')
					res.write('data: [DONE]\n\n')
					res.end()
					return
				}

				throw new ApiError(504, 'The request was interrupted.', 'server_error', 'timeout')
			}

			if (!result.ok) {
				throw new ApiError(500, result.error || 'The model produced an error.', 'server_error')
			}

			const content = fullContent || result.content || ''
			const reasoning = fullThinking || result.thinkingContent || ''
			const usage = toUsage(result.tokenUsage)

			if (stream) {
				streamChunk(res, completionId, created, responseModel, {}, 'stop')
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
							content,
							...(thinkingEnabled || reasoning ? { reasoning_content: reasoning || null } : {}),
							refusal: null,
						},
						logprobs: null,
						finish_reason: 'stop',
					},
				],
				usage: usage ?? {
					prompt_tokens: 0,
					completion_tokens: 0,
					total_tokens: 0,
				},
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
			console.log(`  GET  /v1/models`)
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
