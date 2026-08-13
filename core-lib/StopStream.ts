interface StopStreamProps {
	token: string
	sessionId: string
	messageId: number
}

export default async function stopStream({ token, sessionId, messageId }: StopStreamProps): Promise<Response> {
	return fetch('https://chat.deepseek.com/api/v0/chat/stop_stream', {
		method: 'POST',
		keepalive: true,
		headers: {
			authorization: 'Bearer ' + token,
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			chat_session_id: sessionId,
			message_id: messageId,
		}),
	})
}
