// @ts-ignore
import PowSolver from '@rezaparsian/deepseek-pow-solver';
import chat, {ChatResult, ChatStreamChunk} from "../../core-lib/Chat.js";
import createSessions from "../../core-lib/CreateSessions.js";
import createPowChallenge from "../../core-lib/CreatePowChallenge.js";
import chatSessions from "../../core-lib/ChatSessions.js";
import logFn from "./LogChat.js";

let sessionId = process.env['DEEPSEEK_SESSION_ID'];
let parentMessageId: number | null = process.env['DEEPSEEK_MESSAGE_ID']
	? Number(process.env['DEEPSEEK_MESSAGE_ID'])
	: null;

export default async function sendMessage(
	token: string,
	prompt: string,
	thinkingEnabled = true,
	onChunk?: (chunk: ChatStreamChunk) => void,
	searchEnabled = false,
): Promise<ChatResult> {
	if (parentMessageId === null) {
		const sessions = await chatSessions(token);
		const sessionDetail = sessions.find(session => session.id === sessionId);

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
		prompt,
		thinking_enabled: thinkingEnabled,
		search_enabled: searchEnabled,
		onChunk,
		logFn
	});

	if (!res.ok) {
		throw new Error(res.error);
	} else {
		parentMessageId = res.messageId || parentMessageId;
		return res;
	}
}
