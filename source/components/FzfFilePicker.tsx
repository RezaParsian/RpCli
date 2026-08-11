import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'

type Props = {
	entries: string[]
	query: string
	onCancel: () => void
	onQueryChange: (query: string) => void
	onSelect: (file: string) => void
}

function fuzzyScore(value: string, query: string): number | undefined {
	if (!query) return 0

	const candidate = value.toLowerCase()
	const needle = query.toLowerCase()
	let score = 0
	let previousMatch = -1
	let searchFrom = 0

	for (const character of needle) {
		const match = candidate.indexOf(character, searchFrom)
		if (match < 0) return undefined

		// Adjacent matches and matches after a path separator rank highest.
		score += match === previousMatch + 1 ? 8 : 1
		if (match === 0 || candidate[match - 1] === '/') score += 4
		score -= match * 0.01
		previousMatch = match
		searchFrom = match + 1
	}

	return score - value.length * 0.001
}

export function findFiles(files: string[], query: string): string[] {
	return files
		.map((file) => ({ file, score: fuzzyScore(file, query) }))
		.filter((result): result is { file: string; score: number } => result.score !== undefined)
		.sort((first, second) => second.score - first.score)
		.slice(0, 7)
		.map((result) => result.file)
}

export function createMentionEntries(files: string[]): string[] {
	const entries = new Set(files)

	for (const file of files) {
		const parts = file.split('/')
		for (let index = 1; index < parts.length; index += 1) {
			entries.add(`${parts.slice(0, index).join('/')}/`)
		}
	}

	return [...entries].sort((first, second) => first.localeCompare(second))
}

export default function FzfFilePicker({ entries, query, onCancel, onQueryChange, onSelect }: Props) {
	const matches = useMemo(() => findFiles(entries, query), [entries, query])
	const [selectedIndex, setSelectedIndex] = useState(0)

	useEffect(() => setSelectedIndex(0), [query])

	useInput((input, key) => {
		if (key.escape) {
			onCancel()
			return
		}

		if (key.upArrow) {
			setSelectedIndex((current) => (matches.length === 0 ? 0 : (current - 1 + matches.length) % matches.length))
			return
		}

		if (key.downArrow) {
			setSelectedIndex((current) => (matches.length === 0 ? 0 : (current + 1) % matches.length))
			return
		}

		if (key.return) {
			const selection = matches[selectedIndex]
			if (selection) onSelect(selection)
			return
		}

		if (key.backspace || key.delete) {
			onQueryChange(query.slice(0, -1))
			return
		}

		if (input && !key.ctrl && !key.meta) onQueryChange(query + input)
	})

	return (
		<Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
			<Text color="cyan" bold>
				Files and folders matching @{query}
			</Text>
			{matches.length === 0 ? (
				<Text dimColor>No matching files or folders</Text>
			) : (
				matches.map((file, index) => (
					<Text key={file} color={index === selectedIndex ? 'cyan' : undefined}>
						{index === selectedIndex ? '› ' : '  '}
						{file.endsWith('/') ? '▸ ' : '· '}
						{file}
					</Text>
				))
			)}
			<Text dimColor>↑/↓ select · enter mention · esc close</Text>
		</Box>
	)
}
