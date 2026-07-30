async function createSessions(token: string): Promise<string> {
	const response = await fetch(
		"https://chat.deepseek.com/api/v0/chat_session/create",
		{
			method: "POST",
			headers: {
				authorization: "Bearer " + token,
				"content-type": "application/json",
			}
		}
	);

	return (await response.json()).data.biz_data.id;
}

export default createSessions;
