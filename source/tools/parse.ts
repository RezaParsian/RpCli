import type { ToolCall } from './types.js'

function normalizeParamValue(value: string): string {
	const openingNewline = /^(\r?\n)/.exec(value)?.[1]
	if (!openingNewline) return value

	const closingWrapper = /\r?\n([\t ]*)$/.exec(value)
	let result = value.slice(openingNewline.length)

	if (closingWrapper) {
		result = result.slice(0, -(closingWrapper[0]?.length ?? 0))

		// Tool calls indent <param> one level and their multiline value one
		// additional level. Remove those two wrapper levels from the first
		// content line only; indentation belonging to the value remains intact.
		const tagIndent = closingWrapper[1] ?? ''
		const contentWrapperIndent = tagIndent + tagIndent
		if (contentWrapperIndent && result.startsWith(contentWrapperIndent)) {
			result = result.slice(contentWrapperIndent.length)
		}
	}

	return result
}

function parseParams(body: string): Record<string, unknown> {
	const arguments_: Record<string, unknown> = {}
	const paramPattern = /<param\s+name="([^"]+)">([\s\S]*?)<\/param>/g
	let paramMatch: RegExpExecArray | null

	while ((paramMatch = paramPattern.exec(body)) !== null) {
		const [, paramName, rawValue] = paramMatch
		if (!paramName) continue
		arguments_[paramName] = normalizeParamValue(rawValue ?? '')
	}

	return arguments_
}

/**
 * Parses the first <tool_call> block found in the content, if any.
 * Kept for backwards compatibility with single-call call sites.
 */
export function parseToolCall(content: string): ToolCall | undefined {
	const calls = parseToolCalls(content)
	return calls[0]
}

/**
 * Parses every <tool_call> block found in the content, in the order they appear.
 * A response with no tool_call blocks returns an empty array.
 * A tool_call block with no <param> tags throws, since that indicates malformed model output.
 */
export function parseToolCalls(content: string): ToolCall[] {
	const calls: ToolCall[] = []
	const callPattern = /<tool_call\s+name="([^"]+)">\s*([\s\S]*?)\s*<\/tool_call>/g
	let callMatch: RegExpExecArray | null

	while ((callMatch = callPattern.exec(content)) !== null) {
		const [, name, body] = callMatch
		if (!name || body === undefined) continue

		const arguments_ = parseParams(body)
		if (Object.keys(arguments_).length === 0) {
			throw new TypeError(`Invalid tool call "${name}". Expected at least one <param name="...">value</param> tag.`)
		}

		calls.push({ name, arguments: arguments_ })
	}

	return calls
}

/** Hides complete and partially streamed tool-call markup from user-facing text. */
export function hideStreamingToolCalls(content: string): string {
	const marker = '<tool_call'
	let visible = content.replace(/<tool_call\s+name="[^"]+">[\s\S]*?<\/tool_call>/g, '')
	const incompleteCall = visible.indexOf(marker)
	if (incompleteCall !== -1) visible = visible.slice(0, incompleteCall)

	for (let length = marker.length - 1; length > 0; length -= 1) {
		if (visible.endsWith(marker.slice(0, length))) {
			return visible.slice(0, -length)
		}
	}

	return visible
}
