import { type NextFunction, type Request, type Response } from 'express'
import { ApiError } from './errors.js'

export function getToken(req: Request): string {
	const configured = process.env['DEEPSEEK_TOKEN'] || process.env['RC_TOKEN']
	if (configured) return configured

	const header = req.header('authorization')
	const bearer = header ? /^Bearer\s+(\S+)/i.exec(header)?.[1] : undefined
	if (bearer) return bearer

	throw new ApiError(
		401,
		"You didn't provide an API key. Set DEEPSEEK_TOKEN or pass Authorization: Bearer <token>.",
		'invalid_request_error',
		'invalid_api_key'
	)
}

export function cors(_req: Request, res: Response, next: NextFunction): void {
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
	res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, OpenAI-Beta')
	res.setHeader('Access-Control-Expose-Headers', 'X-RP-Session-Id')
	res.setHeader('Access-Control-Max-Age', '86400')
	next()
}
