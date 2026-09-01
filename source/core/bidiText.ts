import bidiFactory from 'bidi-js'

const bidi = bidiFactory()
const rightToLeftCharacter = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/u

export function containsRightToLeftText(value: string): boolean {
	return rightToLeftCharacter.test(value)
}

// Keep stored/API text in logical order. Only terminal-facing strings are
// reordered because most terminal emulators do not implement Unicode BiDi.
export function toTerminalText(value: string): string {
	if (!containsRightToLeftText(value)) return value

	return value
		.split('\n')
		.map((line) => {
			if (!containsRightToLeftText(line)) return line

			return bidi.getReorderedString(line, bidi.getEmbeddingLevels(line))
		})
		.join('\n')
}
