export default class InvalidTokenError extends Error {
	constructor() {
		super('The DeepSeek token is invalid or has expired.')
		this.name = 'InvalidTokenError'
	}
}

export function assertValidTokenResponse(response: Response, payload?: unknown): void {
	// A 403 can also be returned by DeepSeek's anti-bot/rate-limit layer. Treating
	// every 403 as an expired token makes the CLI immediately delete a valid token.
	if (response.status === 401) {
		throw new InvalidTokenError()
	}

	if (!payload || typeof payload !== 'object') return

	const body = payload as Record<string, unknown>
	const data = body['data'] && typeof body['data'] === 'object' ? (body['data'] as Record<string, unknown>) : undefined
	const code = body['code']
	const bizCode = data?.['biz_code']
	const hasErrorCode = (code !== undefined && code !== 0) || (bizCode !== undefined && bizCode !== 0)

	// Only inspect fields reserved for API errors. Successful responses may contain
	// arbitrary user chat text, including words such as "login" or "invalid token".
	if (!response.ok || hasErrorCode) {
		const errorText = [body['msg'], body['message'], body['error'], data?.['biz_msg']]
			.filter((value): value is string => typeof value === 'string')
			.join(' ')

		if (/unauthorized|invalid.?token|token.?(expired|invalid)|log.?in|login/i.test(errorText)) {
			throw new InvalidTokenError()
		}
	}
}

export function isInvalidTokenError(error: unknown): boolean {
	return error instanceof InvalidTokenError
}
