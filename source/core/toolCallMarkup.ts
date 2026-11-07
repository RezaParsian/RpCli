/** Preserve JSON payloads verbatim, including literal XML and DSML in file content. */
export function normalizeToolCallMarkup(content: string): string {
	return content
}

export function createToolCallMarkupNormalizer(): (content: string, flush?: boolean) => string {
	return (content) => content
}
