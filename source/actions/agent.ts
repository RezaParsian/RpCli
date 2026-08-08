import sendMessage from '../core/apiClient.js';
import {SystemPrompt} from '../prompts/index.js';
import {
	executeToolCalls,
	formatToolActivityMessage,
	parseToolCalls,
	type ToolCall,
	type ToolResult,
} from '../tools/index.js';
import {ChatResult, ChatStreamChunk} from "../../core-lib/Chat.js";

export const CHAT_SYSTEM_PROMPT = SystemPrompt();

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
	thinkingEnabled = true,
	onChunk?: (chunk: ChatStreamChunk) => void,
	searchEnabled = false,
	mode: 'plan' | 'normal' | 'yolo' = 'normal'
): Promise<ChatResult> {
	let response = await sendMessage(
		token,
		messages,
		thinkingEnabled,
		onChunk,
		searchEnabled,
	);

	while (true) {
		let toolCalls: ToolCall[];

		try {
			toolCalls = parseToolCalls(response.content || '');
		} catch (error) {
			response = await sendMessage(
				token,
				`The tool call could not be parsed: ${
					error instanceof Error ? error.message : String(error)
				}. Send a corrected tool call or answer without a tool.`,
				thinkingEnabled,
				onChunk,
				searchEnabled,
			);
			continue;
		}

		if (toolCalls.length === 0) return response;

		onToolMessage?.(
			formatToolActivityMessage(response.content ?? '', toolCalls),
		);

		const results = await executeToolCalls(
			toolCalls,
			async call => confirmTool ? confirmTool(call) : false,
			mode
		);

		response = await sendMessage(
			token,
			formatResultsMessage(results),
			thinkingEnabled,
			onChunk,
			searchEnabled,
		);
	}
}
