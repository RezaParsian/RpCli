export function mentionQuery(value: string): string | undefined {
	const match = /(?:^|\s)@([^\s@]*)$/.exec(value)
	return match?.[1]
}

export function slashCommandQuery(value: string): string | undefined {
	const match = /^\/([^\s/]*)$/.exec(value.trimStart())
	return match?.[1]
}

export function endPosition(value: string): [line: number, column: number] {
	const lines = value.split('\n')

	return [lines.length - 1, lines[lines.length - 1]?.length ?? 0]
}

export function cursorOffset(value: string, position: [number, number]): number {
	const lines = value.split('\n')

	let offset = 0

	for (let index = 0; index < position[0]; index += 1) {
		offset += (lines[index]?.length ?? 0) + 1
	}

	return offset + position[1]
}

export function positionAt(value: string, offset: number): [number, number] {
	const beforeCursor = value.slice(0, Math.max(0, Math.min(offset, value.length)))

	return endPosition(beforeCursor)
}

export function previousWordOffset(value: string, offset: number): number {
	const beforeCursor = value.slice(0, offset)
	const result = beforeCursor.search(/\S+\s*$/)

	return result === -1 ? 0 : result
}

export function nextWordOffset(value: string, offset: number): number {
	const match = /\s*\S+/.exec(value.slice(offset))

	return match ? offset + match.index + match[0].length : value.length
}

const GraphemeSegmenter = (
	Intl as unknown as {
		Segmenter: new (locale: string, options: { granularity: 'grapheme' }) => {
			segment: (value: string) => Iterable<{
				index: number
				segment: string
			}>
		}
	}
).Segmenter

const graphemeSegmenter = new GraphemeSegmenter('en', {
	granularity: 'grapheme',
})

export function previousCharacterOffset(value: string, offset: number): number {
	if (offset <= 0) return 0

	let previousOffset = 0
	for (const segment of graphemeSegmenter.segment(value)) {
		if (segment.index >= offset) break
		previousOffset = segment.index
	}

	return previousOffset
}

export function nextCharacterOffset(value: string, offset: number): number {
	if (offset >= value.length) return value.length

	for (const segment of graphemeSegmenter.segment(value)) {
		const end = segment.index + segment.segment.length
		if (end > offset) return end
	}

	return value.length
}

export function nextDeleteWordOffset(value: string, offset: number): number {
	const match = /^(?:\s+|\S+\s*)/.exec(value.slice(offset))
	return match ? offset + match[0].length : offset
}
