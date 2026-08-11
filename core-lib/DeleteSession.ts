async function deleteSession(token: string, sessionId: string) {
	return await fetch('https://chat.deepseek.com/api/v0/chat_session/delete', {
		method: 'POST',
		keepalive: true,
		headers: {
			authorization: 'Bearer ' + token,
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			chat_session_id: sessionId,
		}),
	})
}

export default deleteSession
