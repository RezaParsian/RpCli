import sendMessage from '../core/SendMessage.js';
import {ChatResult} from '../core/Chat.js';
import {
	executeTool,
	parseToolCall,
	TOOL_SYSTEM_PROMPT,
} from '../tools/index.js';

export const CHAT_SYSTEM_PROMPT = `You are RP-CLI, an advanced and powerful AI assistant built to help developers with high-quality responses.

You are intelligent, concise, accurate, and slightly opinionated when it makes sense.
Your responses are clear, well-structured, and professional by default, but you can adapt your tone based on the user's request.

Key traits:
- Be direct and to the point
- Provide high-quality, thoughtful answers
- Use proper formatting when helpful (bullet points, code blocks, etc.)
- Avoid unnecessary fluff and pleasantries
- If the user asks for short answers, be brief. If they want detailed explanations, go deeper.

You are currently running as "rp-cli" — a command line tool that helps users with AI-powered tasks.

Now, respond to the user's request with excellence.

${TOOL_SYSTEM_PROMPT}`;

const MAX_TOOL_CALLS = 5;

export async function getAIResponse(
	token: string,
	messages: string,
): Promise<ChatResult> {
	let response = await sendMessage(token, messages);

	for (let index = 0; index < MAX_TOOL_CALLS; index++) {
		let toolCall;
		try {
			toolCall = parseToolCall(response.content ?? '');
		} catch (error) {
			response = await sendMessage(
				token,
				`The tool call could not be parsed: ${
					error instanceof Error ? error.message : String(error)
				}. Send a corrected tool call or answer without a tool.`,
			);
			continue;
		}

		if (!toolCall) return response;

		const result = await executeTool(toolCall);
		response = await sendMessage(
			token,
			`<tool_result name="${toolCall.name}">\n${result}\n</tool_result>\nUse this result to continue answering the user's request.`,
		);
	}

	throw new Error(
		`The assistant exceeded the limit of ${MAX_TOOL_CALLS} tool calls.`,
	);
}
