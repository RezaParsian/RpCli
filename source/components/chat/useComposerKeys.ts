import { useInput } from 'ink'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { ChatMode } from '../../actions/agent.js'
import {
	cursorOffset,
	endPosition,
	mentionQuery,
	nextCharacterOffset,
	nextDeleteWordOffset,
	nextWordOffset,
	positionAt,
	previousCharacterOffset,
	previousWordOffset,
	slashCommandQuery,
} from '../../core/textCursor.js'

type Options = {
	input: string
	cursorPosition: [line: number, column: number]
	setInput: (value: string) => void
	setCursorPosition: (position: [line: number, column: number]) => void
	setFilePickerOpen: (open: boolean) => void
	setCommandPickerOpen: (open: boolean) => void
	setMode: Dispatch<SetStateAction<ChatMode>>
	rawBackspaceModifiers: MutableRefObject<boolean[]>
	isActive: boolean
}

export function useComposerKeys({
	input,
	cursorPosition,
	setInput,
	setCursorPosition,
	setFilePickerOpen,
	setCommandPickerOpen,
	setMode,
	rawBackspaceModifiers,
	isActive,
}: Options) {
	useInput(
		(_input, key) => {
			const lines = input.split('\n')
			const [line, column] = cursorPosition
			const offset = cursorOffset(input, cursorPosition)

			if (key.backspace || key.delete) {
				if (key.meta) return

				const ctrlBackspace = key.backspace ? rawBackspaceModifiers.current.shift() === true : false
				const deleteByWord = key.ctrl || ctrlBackspace
				const start = key.backspace
					? key.super
						? cursorOffset(input, [line, 0])
						: deleteByWord
						? previousWordOffset(input, offset)
						: previousCharacterOffset(input, offset)
					: offset
				const end = key.delete
					? deleteByWord
						? nextDeleteWordOffset(input, offset)
						: nextCharacterOffset(input, offset)
					: offset

				if (start !== end) {
					const nextValue = input.slice(0, start) + input.slice(end)
					setInput(nextValue)
					setCursorPosition(positionAt(nextValue, start))
					setFilePickerOpen(mentionQuery(nextValue) !== undefined)
					setCommandPickerOpen(slashCommandQuery(nextValue) !== undefined)
				}

				return
			}

			if (key.home || (key.ctrl && key.upArrow)) {
				setCursorPosition(key.ctrl ? [0, 0] : [line, 0])
				return
			}

			if (key.end || (key.ctrl && key.downArrow)) {
				setCursorPosition(key.ctrl ? endPosition(input) : [line, lines[line]?.length ?? 0])
				return
			}

			if (key.leftArrow) {
				const nextOffset =
					key.ctrl || key.meta ? previousWordOffset(input, offset) : previousCharacterOffset(input, offset)
				setCursorPosition(positionAt(input, nextOffset))
				return
			}

			if (key.rightArrow) {
				const nextOffset = key.ctrl || key.meta ? nextWordOffset(input, offset) : nextCharacterOffset(input, offset)
				setCursorPosition(positionAt(input, nextOffset))
				return
			}

			if (key.upArrow && line > 0) {
				setCursorPosition([line - 1, Math.min(column, lines[line - 1]?.length ?? 0)])
				return
			}

			if (key.downArrow && line < lines.length - 1) {
				setCursorPosition([line + 1, Math.min(column, lines[line + 1]?.length ?? 0)])
				return
			}

			if (key.pageUp || key.pageDown) {
				const direction = key.pageUp ? -1 : 1
				const targetLine = Math.max(0, Math.min(lines.length - 1, line + direction * 5))
				setCursorPosition([targetLine, Math.min(column, lines[targetLine]?.length ?? 0)])
				return
			}

			if (key.tab) {
				setMode((previous) => {
					if (previous === 'normal') return 'yolo'
					if (previous === 'yolo') return 'plan'
					return 'normal'
				})
			}
		},
		{ isActive }
	)
}
