import sendMessage from '../core/SendMessage.js';
import {ChatResult} from '../core/Chat.js';
import {
	executeTool,
	describeToolActivity,
	parseToolCall,
	TOOL_SYSTEM_PROMPT,
	toolRequiresConfirmation,
	type ToolCall,
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

const TOOL_ACTIVITY_RENDER_DELAY_MS = 150;

export async function getAIResponse(
	token: string,
	messages: string,
	confirmTool?: (call: ToolCall) => Promise<boolean>,
	onToolActivity?: (activity?: string) => void,
): Promise<ChatResult> {
	let response = await sendMessage(token, messages);

	while (true) {
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

		const runTool = async () => {
			onToolActivity?.(describeToolActivity(toolCall));
			try {
				// Give Ink a render cycle before a fast filesystem tool completes.
				if (onToolActivity) {
					await new Promise(resolve => {
						setTimeout(resolve, TOOL_ACTIVITY_RENDER_DELAY_MS);
					});
				}
				return await executeTool(toolCall);
			} finally {
				onToolActivity?.();
			}
		};

		let result: string;
		if (toolRequiresConfirmation(toolCall.name)) {
			const approved = confirmTool ? await confirmTool(toolCall) : false;
			result = approved
				? await runTool()
				: JSON.stringify({ok: false, error: 'User denied this tool call.'});
		} else {
			result = await runTool();
		}
		response = await sendMessage(
			token,
			`<tool_result name="${toolCall.name}">\n${result}\n</tool_result>\nUse this result to continue answering the user's request.`,
		);
	}
}
