import ava, { type TestFn } from 'ava'
import { executeTool } from '../source/tools/execute.js'
import { formatToolActivityMessage } from '../source/tools/describe.js'
import { hideStreamingToolCalls, parseResponseToolCalls, parseToolCalls } from '../source/tools/parse.js'

const test = ava as unknown as TestFn
const fence = '```'
const callBlock = (name: string, input: unknown) => `${fence}tool_call\nname: ${name}\ninput: ${JSON.stringify(input)}\n${fence}`
const reportedToolCall = callBlock('read_file', { path: 'test/fixtures/lines.txt', offset: 2, limit: 2 })

test('parses and executes a ranged read_file call with JSON numeric arguments', async (t) => {
	const [call] = parseToolCalls(reportedToolCall)
	t.truthy(call)
	if (!call) return
	t.deepEqual(await executeTool(call), { ok: true, tool_name: 'read_file', result: 'second\nthird' })
})

test('falls back to thinking content and prefers response calls', (t) => {
	t.is(parseResponseToolCalls('', reportedToolCall).sourceContent, reportedToolCall)
	t.deepEqual(parseResponseToolCalls(reportedToolCall, callBlock('list_directory', {})).calls, [
		{ name: 'read_file', arguments: { path: 'test/fixtures/lines.txt', offset: 2, limit: 2 } },
	])
})

test('preserves file content including fences, XML, quotes and backslashes', (t) => {
	const input = { path: 'example.md', content: 'First\n```\n<tool_calls>"quoted"</tool_calls>\nC:\\test\n' }
	t.deepEqual(parseToolCalls(callBlock('write_file', input)), [{ name: 'write_file', arguments: input }])
})

test('accepts empty objects, CRLF and pretty JSON', (t) => {
	t.deepEqual(parseToolCalls(callBlock('list_directory', {})), [{ name: 'list_directory', arguments: {} }])
	t.deepEqual(parseToolCalls('```tool_call\r\nname: read_file\r\ninput: {\r\n "path": "test.txt"\r\n}\r\n```'), [
		{ name: 'read_file', arguments: { path: 'test.txt' } },
	])
})

test('accepts surrounding prose and multiple calls', (t) => {
	const expected = parseToolCalls(reportedToolCall)
	t.deepEqual(parseToolCalls('Checking.\n' + reportedToolCall + '\nContinuing.'), expected)
	t.deepEqual(parseToolCalls(reportedToolCall + '\n' + reportedToolCall), [...expected, ...expected])
})

test('rejects malformed calls and non-object inputs', (t) => {
	for (const input of [null, [], 'text', 42]) t.throws(() => parseToolCalls(callBlock('read_file', input)))
	for (const content of [
		'```tool_call\nname: read_file\ninput: {bad}\n```',
		'```tool_call\ninput: {}\n```',
		'```tool_call\nname: read_file\ninput: {}',
	])
		t.throws(() => parseToolCalls(content))
	t.deepEqual(parseToolCalls('Ordinary response'), [])
})

test('hides every partial streamed tool block without hiding ordinary code', (t) => {
	for (let length = 1; length <= reportedToolCall.length; length++) {
		t.is(hideStreamingToolCalls(`Checking.\n${reportedToolCall.slice(0, length)}`), 'Checking.\n')
	}
	t.is(hideStreamingToolCalls('```ts\nconst value = 1\n```\n'), '```ts\nconst value = 1\n```\n')
	t.is(hideStreamingToolCalls(`${reportedToolCall}\nDone`), '\nDone')
})

test('replaces each tool block with its own activity', (t) => {
	const content = reportedToolCall + '\n' + callBlock('list_directory', {})
	const display = formatToolActivityMessage(content, [
		...parseToolCalls(reportedToolCall),
		...parseToolCalls(callBlock('list_directory', {})),
	])
	t.is(display, '⚙  Reading test/fixtures/lines.txt...\n⚙  Listing the current directory...')
})
