import { assertValidTokenResponse } from './InvalidTokenError.js'

async function createSessions(token: string): Promise<string> {
	const response = await fetch('https://chat.deepseek.com/api/v0/chat_session/create', {
		method: 'POST',
		headers: {
			authorization: 'Bearer ' + token,
			'content-type': 'application/json',
		},
	})

	const payload = await response.json()
	assertValidTokenResponse(response, payload)
	return payload.data.biz_data.id
}

export default createSessions
