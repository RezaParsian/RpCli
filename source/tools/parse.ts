import type { ToolCall } from './types.js'

function normalizeParamValue(value: string): string {
	const openingNewline = /^(\r?\n)/.exec(value)?.[1]
	if (!openingNewline) return value

	const closingWrapper = /\r?\n([\t ]*)$/.exec(value)
	let result = value.slice(openingNewline.length)

	if (closingWrapper) {
		result = result.slice(0, -(closingWrapper[0]?.length ?? 0))

		// Tool calls indent <parameter> one level and their multiline value one
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
	const paramPattern = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/g
	let paramMatch: RegExpExecArray | null

	while ((paramMatch = paramPattern.exec(body)) !== null) {
		const [, paramName, rawValue] = paramMatch
		if (!paramName) continue
		arguments_[paramName] = normalizeParamValue(rawValue ?? '')
	}

	return arguments_
}

/**
 * Parses the first <invoke> block found in the content, if any.
 * Kept for backwards compatibility with single-call call sites.
 */
export function parseToolCall(content: string): ToolCall | undefined {
	const calls = parseToolCalls(content)
	return calls[0]
}

/**
 * Parses every <invoke> block inside a <tool_calls> wrapper, in the order they appear.
 * A response with no complete tool_calls wrapper returns an empty array.
 * An invoke block with no <parameter> tags throws, since that indicates malformed model output.
 */
export function parseToolCalls(content: string): ToolCall[] {
	const calls: ToolCall[] = []
	const wrapperPattern = /<tool_calls>\s*([\s\S]*?)\s*<\/tool_calls>/g
	const callPattern = /<invoke\s+name="([^"]+)">\s*([\s\S]*?)\s*<\/invoke>/g
	let wrapperMatch: RegExpExecArray | null
	let callMatch: RegExpExecArray | null

	while ((wrapperMatch = wrapperPattern.exec(content)) !== null) {
		const wrapperBody = wrapperMatch[1] ?? ''
		callPattern.lastIndex = 0

		while ((callMatch = callPattern.exec(wrapperBody)) !== null) {
			const [, name, body] = callMatch
			if (!name || body === undefined) continue

			const arguments_ = parseParams(body)
			if (Object.keys(arguments_).length === 0) {
				throw new TypeError(
					`Invalid tool call "${name}". Expected at least one <parameter name="...">value</parameter> tag.`
				)
			}

			calls.push({ name, arguments: arguments_ })
		}
	}

	return calls
}

/** Hides complete and partially streamed tool-call markup from user-facing text. */
export function hideStreamingToolCalls(content: string): string {
	const marker = '<tool_calls'
	let visible = content.replace(/<tool_calls>[\s\S]*?<\/tool_calls>/g, '')
	const incompleteCall = visible.indexOf(marker)
	if (incompleteCall !== -1) visible = visible.slice(0, incompleteCall)

	for (let length = marker.length - 1; length > 0; length -= 1) {
		if (visible.endsWith(marker.slice(0, length))) {
			return visible.slice(0, -length)
		}
	}

	return visible
}
