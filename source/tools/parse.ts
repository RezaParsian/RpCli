import type { ToolCall } from './types.js'

/** Complete fenced calls; JSON strings encode embedded newlines and fences. */
export const toolCallPattern = /^```tool_call[^\S\r\n]*\r?\n([\s\S]*?)^```[^\S\r\n]*(?=\r?$)/gm

export function parseToolCall(content: string): ToolCall | undefined {
	return parseToolCalls(content)[0]
}

export function parseToolCalls(content: string): ToolCall[] {
	const calls: ToolCall[] = []
	const remaining = content.replace(toolCallPattern, (_block, body: string) => {
		const match = /^name:[ \t]*([a-zA-Z_][a-zA-Z0-9_]*)[ \t]*\r?\ninput:[ \t]*([\s\S]+)$/.exec(body.trim())
		if (!match) throw new TypeError('Invalid tool_call. Expected name: <tool_name> followed by input: <JSON object>.')

		const input: unknown = JSON.parse(match[2] ?? '')
		if (!input || typeof input !== 'object' || Array.isArray(input)) {
			throw new TypeError('Invalid tool_call input. Expected a JSON object.')
		}

		calls.push({ name: match[1]!, arguments: input as Record<string, unknown> })
		return ''
	})
	if (/^```tool_call\b/m.test(remaining)) {
		throw new TypeError('Invalid tool_call block. Expected a closing Markdown fence on its own line.')
	}

	return calls
}

export function parseResponseToolCalls(content: string, thinkingContent: string): { calls: ToolCall[]; sourceContent: string } {
	const contentCalls = parseToolCalls(content)
	if (contentCalls.length > 0 || !thinkingContent) {
		return { calls: contentCalls, sourceContent: content }
	}

	return { calls: parseToolCalls(thinkingContent), sourceContent: thinkingContent }
}

/** Hides complete and partially streamed tool calls from user-facing text. */
export function hideStreamingToolCalls(content: string): string {
	const marker = '```tool_call'
	let visible = content.replace(toolCallPattern, '')
	const incompleteCall = visible.search(/^```tool_call\b/m)
	if (incompleteCall !== -1) visible = visible.slice(0, incompleteCall)

	const lastLine = visible.slice(visible.lastIndexOf('\n') + 1)
	if (lastLine && marker.startsWith(lastLine)) {
		return visible.slice(0, -lastLine.length)
	}

	return visible
}
