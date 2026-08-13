interface ContinueChatProps {
	token: string
	sessionId: string
	messageId: number
	signal?: AbortSignal
}

export default async function continueChat({ token, sessionId, messageId, signal }: ContinueChatProps): Promise<Response> {
	return fetch('https://chat.deepseek.com/api/v0/chat/continue', {
		method: 'POST',
		signal,
		headers: {
			authorization: 'Bearer ' + token,
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			chat_session_id: sessionId,
			message_id: messageId,
			fallback_to_resume: true,
		}),
	})
}
