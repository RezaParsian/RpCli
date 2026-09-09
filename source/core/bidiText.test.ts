import test from 'ava'
import { containsRightToLeftText, terminalSupportsBidirectionalText, toTerminalText } from './bidiText.js'

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

test('detects terminals with native bidirectional text support', (t) => {
	t.true(terminalSupportsBidirectionalText({ VTE_VERSION: '7600' }))
	t.true(terminalSupportsBidirectionalText({ KONSOLE_VERSION: '240800' }))
	t.false(terminalSupportsBidirectionalText({ TERM_PROGRAM: 'ghostty' }))
})
