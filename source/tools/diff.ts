export function formatDiff(pathLabel: string, oldText: string, newText: string): string {
	const lines = [`--- a/${pathLabel}`, `+++ b/${pathLabel}`]
	if (oldText === newText) return [...lines, '  (no changes)'].join('\n')

	const oldLines = oldText.split('\n')
	const newLines = newText.split('\n')
	let start = 0

	while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
		start += 1
	}

	let oldEnd = oldLines.length
	let newEnd = newLines.length
	while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
		oldEnd -= 1
		newEnd -= 1
	}

	const contextStart = Math.max(0, start - 2)
	const oldContextEnd = Math.min(oldLines.length, oldEnd + 2)
	const newContextEnd = Math.min(newLines.length, newEnd + 2)
	const oldHunkLength = oldContextEnd - contextStart
	const newHunkLength = newContextEnd - contextStart
	lines.push(`@@ -${contextStart + 1},${oldHunkLength} +${contextStart + 1},${newHunkLength} @@`)

	if (contextStart > 0) lines.push('  …')

	for (let index = contextStart; index < start; index += 1) {
		lines.push(`  ${oldLines[index] ?? ''}`)
	}

	for (let index = start; index < oldEnd; index += 1) {
		lines.push(`- ${oldLines[index] ?? ''}`)
	}

	for (let index = start; index < newEnd; index += 1) {
		lines.push(`+ ${newLines[index] ?? ''}`)
	}

	for (let index = newEnd; index < newContextEnd; index += 1) {
		lines.push(`  ${newLines[index] ?? ''}`)
	}

	if (oldContextEnd < oldLines.length || newContextEnd < newLines.length) {
		lines.push('  …')
	}

	return lines.join('\n')
}
