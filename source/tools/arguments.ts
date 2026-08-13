export function stringArgument(arguments_: Record<string, unknown>, name: string, fallback?: string): string {
	const value = arguments_[name] !== '' ? arguments_[name] : fallback
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(`Argument "${name}" must be a non-empty string.`)
	}

	return value
}

/** Undo a fully HTML-escaped payload (`&lt;html&gt;...`) so write_file gets real tags. */
export function unescapeEscapedMarkup(value: string): string {
	if (!/&lt;/i.test(value)) return value
	if (/<[a-zA-Z!/?]/.test(value)) return value

	return value
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&apos;/gi, "'")
		.replace(/&#0*39;/g, "'")
		.replace(/&amp;/gi, '&')
}

export function textArgument(arguments_: Record<string, unknown>, name: string): string {
	const value = arguments_[name]
	if (typeof value !== 'string') {
		throw new TypeError(`Argument "${name}" must be a string.`)
	}

	return unescapeEscapedMarkup(value)
}
