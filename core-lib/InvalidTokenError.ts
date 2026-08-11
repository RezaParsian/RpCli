export default class InvalidTokenError extends Error {
	constructor() {
		super('The DeepSeek token is invalid or has expired.')
		this.name = 'InvalidTokenError'
	}
}

export function assertValidTokenResponse(response: Response, payload?: unknown): void {
	if (response.status === 401 || response.status === 403) {
		throw new InvalidTokenError()
	}

	if (payload) {
		const serializedPayload = JSON.stringify(payload)
		if (/unauthorized|forbidden|invalid.?token|token.?(expired|invalid)|log.?in|login/i.test(serializedPayload)) {
			throw new InvalidTokenError()
		}
	}
}

export function isInvalidTokenError(error: unknown): boolean {
	return error instanceof InvalidTokenError
}
