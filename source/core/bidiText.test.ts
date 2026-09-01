import test from 'ava'
import { containsRightToLeftText, toTerminalText } from './bidiText.js'

test('leaves left-to-right text unchanged', (t) => {
	t.is(toTerminalText('Hello, TypeScript!'), 'Hello, TypeScript!')
})

test('reorders Persian text for a left-to-right terminal', (t) => {
	t.is(toTerminalText('سلام'), 'مالس')
})

test('keeps separate lines independent', (t) => {
	t.is(toTerminalText('سلام\nhello'), 'مالس\nhello')
})

test('detects Persian text', (t) => {
	t.true(containsRightToLeftText('متن فارسی'))
	t.false(containsRightToLeftText('plain text'))
})
