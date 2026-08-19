import sendMessage, { beginGeneration, isGenerationStopped } from '../core/apiClient.js'
import { SystemPrompt } from '../prompts/index.js'
import { executeToolCalls, formatToolActivityMessage, parseToolCalls, type ToolCall, type ToolResult } from '../tools/index.js'
import { type ChatResult, type ChatStreamChunk } from '../../core-lib/index.js'

export type ChatMode = 'plan' | 'normal' | 'yolo'

export type AIResponseOptions = {
	token: string
	prompt: string
	confirmTool?: (call: ToolCall) => Promise<boolean>
	onToolMessage?: (content: string) => void
	thinkingEnabled?: boolean
	onChunk?: (chunk: ChatStreamChunk) => void
	searchEnabled?: boolean
	mode?: ChatMode
	toolsEnabled?: boolean
}

export function getChatSystemPrompt(): string {
	return SystemPrompt()
}

function formatResultsMessage(results: ToolResult[]): string {
	const blocks = results
		.map((result) => {
			const body = result.ok ? result.result ?? '' : `Error: ${result.error}`
			return `<tool_result name="${result.tool_name}" ok="${result.ok}">\n${body}\n</tool_result>`
		})
		.join('\n')

	return `${blocks}\nUse these results to continue answering the user's request.`
}

function formatToolResultsForDisplay(results: ToolResult[]): string {
	const lines = results.map((result) => {
		if (!result.ok) {
			return `❌ ${result.tool_name}: ${result.error}`
		}
		const output = result.result?.trim() || '(no output)'
		return `⚙️ ${result.tool_name}:\n${output}`
	})
	return lines.join('\n\n')
}

const MAX_TOOL_ROUNDS = 10

function toolRoundLimitMessage(): string {
	return `Stopped after ${MAX_TOOL_ROUNDS} tool rounds. Type /continue to keep going.`
}

export async function getAIResponse({
	token,
	prompt,
	confirmTool,
	onToolMessage,
	thinkingEnabled = true,
	onChunk,
	searchEnabled = false,
	mode = 'normal',
	toolsEnabled = true,
}: AIResponseOptions): Promise<ChatResult> {
	const signal = beginGeneration()

	const send = (nextPrompt: string) =>
		sendMessage({
			token,
			prompt: nextPrompt,
			thinkingEnabled,
			searchEnabled,
			onChunk,
		})

	let response = await send(prompt)
	if (!toolsEnabled) return response

	let toolRounds = 0

	while (true) {
		if (response.stopped || isGenerationStopped()) return response

		let toolCalls: ToolCall[]

		try {
			toolCalls = parseToolCalls(response.content || '')
		} catch (error) {
			if (toolRounds >= MAX_TOOL_ROUNDS) {
				onToolMessage?.(toolRoundLimitMessage())
				return response
			}

			toolRounds += 1
			response = await send(
				`The tool call could not be parsed: ${
					error instanceof Error ? error.message : String(error)
				}. Send a corrected tool call or answer without a tool.`
			)
			continue
		}

		if (toolCalls.length === 0) return response

		if (toolRounds >= MAX_TOOL_ROUNDS) {
			onToolMessage?.(toolRoundLimitMessage())
			return send(
				'Maximum tool call rounds reached. Summarize what you finished and what remains. Do not use tools. Tell the user they can type /continue to keep working.'
			)
		}

		toolRounds += 1
		onToolMessage?.(formatToolActivityMessage(response.content ?? '', toolCalls))

		const results = await executeToolCalls(toolCalls, async (call) => (confirmTool ? confirmTool(call) : false), mode, signal)

		if (isGenerationStopped()) return response

		// Show tool results to the user
		const displayMessage = formatToolResultsForDisplay(results)
		if (displayMessage) {
			onToolMessage?.(displayMessage)
		}

		response = await send(formatResultsMessage(results))
	}
}
