export function normalizeToolCallMarkup(content: string): string {
	return content
		.replace(/<([/]?)｜+DSML｜+\s*(calls|tool_calls|invoke|parameter)\b/g, (_match, slash: string, tag: string) => {
			const normalizedTag = tag === 'calls' ? 'tool_calls' : tag
			return `<${slash}${normalizedTag}`
		})
		.replace(/<calls>/g, '<tool_calls>')
		.replace(/<\/calls>/g, '</tool_calls>')
}

function isPotentialToolTag(content: string): boolean {
	const name = content.startsWith('</') ? content.slice(2) : content.slice(1)
	if (!name || name === '/') return true
	if (name.startsWith('｜')) return true
	return ['calls', 'tool_calls'].some((tag) => tag.startsWith(name) || name.startsWith(tag))
}

export function createToolCallMarkupNormalizer(): (content: string, flush?: boolean) => string {
	let pending = ''

	return (content, flush = false) => {
		const combined = pending + content
		const lastOpening = combined.lastIndexOf('<')
		const incompleteTag =
			lastOpening !== -1 && combined.indexOf('>', lastOpening) === -1 && isPotentialToolTag(combined.slice(lastOpening))
		const safeEnd = !flush && incompleteTag ? lastOpening : combined.length
		pending = combined.slice(safeEnd)
		return normalizeToolCallMarkup(combined.slice(0, safeEnd))
	}
}
