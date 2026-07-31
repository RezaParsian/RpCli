import chat, {ChatResult} from "./Chat.js";
import chatSessions from "./ChatSessions.js";
import createPowChallenge from "./CreatePowChallenge.js";
import createSessions from "./CreateSessions.js";
// @ts-ignore
import PowSolver from '@rezaparsian/deepseek-pow-solver'

let sessionId = process.env["DEEPSEEK_SESSION_ID"];
let parentMessageId: number | null = process.env['DEEPSEEK_MESSAGE_ID'] ? Number(process.env['DEEPSEEK_MESSAGE_ID']) : null;

export default async function sendMessage(token: string, prompt: string): Promise<ChatResult> {
	if (parentMessageId === null) {
		const sessions = await chatSessions(token);
		const sessionDetail = sessions.find((session) => session.id === sessionId);

		if (!sessionDetail) {
			parentMessageId = null;
			sessionId = await createSessions(token);
		} else {
			parentMessageId = sessionDetail.current_message_id;
		}
	}

	if (!sessionId) throw new Error('sessionId is missing');

	const solver = new PowSolver();
	solver.init();

	const pow = await createPowChallenge(token);

	const payload = solver.solve(pow);
	const challenge = btoa(JSON.stringify(payload));

	const res = await chat({
		token,
		challenge,
		sessionId,
		parentMessageId,
		prompt
	});

	if (!res.ok) {
		throw new Error(res.error)
	} else {
		parentMessageId = res.messageId || parentMessageId;
		return res
	}
}
