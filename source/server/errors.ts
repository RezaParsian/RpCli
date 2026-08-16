import { type Response } from 'express'
import { isInvalidTokenError } from '../../core-lib/index.js'

export class ApiError extends Error {
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

export function errorBody(error: ApiError) {
	return {
		error: {
			message: error.message,
			type: error.type,
			param: error.param,
			code: error.code,
		},
	}
}

export function sendError(res: Response, error: ApiError): void {
	if (res.headersSent) {
		res.end()
		return
	}

	res.status(error.status).json(errorBody(error))
}

export function toApiError(error: unknown): ApiError {
	if (error instanceof ApiError) return error
	if (isInvalidTokenError(error)) {
		return new ApiError(401, 'Invalid API key provided.', 'invalid_request_error', 'invalid_api_key')
	}

	const message = error instanceof Error ? error.message : String(error)
	return new ApiError(500, message || 'Internal server error', 'server_error')
}
