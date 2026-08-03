import sendMessage from '../core/SendMessage.js';
import {ChatResult} from '../core/Chat.js';
import {
	executeToolCalls,
	formatToolActivityMessage,
	parseToolCalls,
	TOOL_SYSTEM_PROMPT,
	type ToolCall,
	type ToolResult,
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

You are currently running as "rc" in ${process.platform} — a command line tool that helps users with AI-powered tasks.

Paths prefixed with @ in a user message are files or folders the user explicitly referenced. Use read_file for referenced files and list_directory or search_files for referenced folders when their contents are relevant to the request.

Now, respond to the user's request with excellence.

${TOOL_SYSTEM_PROMPT}`;

function formatResultsMessage(results: ToolResult[]): string {
	const blocks = results
		.map(result => {
			const body = result.ok ? result.result ?? '' : `Error: ${result.error}`;
			return `<tool_result name="${result.tool_name}" ok="${result.ok}">\n${body}\n</tool_result>`;
		})
		.join('\n');

	return `${blocks}\nUse these results to continue answering the user's request.`;
}

export async function getAIResponse(
	token: string,
	messages: string,
	confirmTool?: (call: ToolCall) => Promise<boolean>,
	onToolMessage?: (content: string) => void,
): Promise<ChatResult> {
	let response = await sendMessage(token, messages);

	while (true) {
		let toolCalls: ToolCall[];

		try {
			toolCalls = parseToolCalls(response.content ?? '');
		} catch (error) {
			response = await sendMessage(
				token,
				`The tool call could not be parsed: ${
					error instanceof Error ? error.message : String(error)
				}. Send a corrected tool call or answer without a tool.`,
			);
			continue;
		}

		if (toolCalls.length === 0) return response;

		onToolMessage?.(
			formatToolActivityMessage(response.content ?? '', toolCalls),
		);

		const results = await executeToolCalls(toolCalls, async call =>
			confirmTool ? confirmTool(call) : false,
		);

		response = await sendMessage(token, formatResultsMessage(results));
	}
}
