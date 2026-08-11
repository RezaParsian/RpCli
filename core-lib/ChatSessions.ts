interface ChatSession {
	id: string
	seq_id: number
	title: string
	title_type: string
	updated_at: number
	pinned: boolean
	model_type: 'expert'
	agent: 'chat'
	version: number
	current_message_id: number
	inserted_at: number
}

async function chatSessions(token: string): Promise<ChatSession[]> {
	const response = await fetch('https://chat.deepseek.com/api/v0/chat_session/fetch_page', {
		method: 'GET',
		headers: {
			authorization: 'Bearer ' + token,
			'content-type': 'application/json',
		},
	})

	const payload = await response.json()
	assertValidTokenResponse(response, payload)
	return payload.data.biz_data.chat_sessions
}

export default chatSessions
import { assertValidTokenResponse } from './InvalidTokenError.js'
