interface PowChallenge {
	challenge: string;
}

async function createPowChallenge(token: string): Promise<PowChallenge> {
	const response = await fetch(
		"https://chat.deepseek.com/api/v0/chat/create_pow_challenge",
		{
			method: "POST",
			headers: {
				authorization: "Bearer " + token,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				target_path: "/api/v0/chat/completion",
			}),
		}
	);

	return (await response.json()).data.biz_data.challenge;
}

export default createPowChallenge;
