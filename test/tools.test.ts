import ava, { type TestFn } from 'ava'
import { executeTool } from '../source/tools/execute.js'
import { hideStreamingToolCalls, parseResponseToolCalls, parseToolCalls } from '../source/tools/parse.js'

const test = ava as unknown as TestFn

const reportedToolCall = `<tool_calls>
<invoke name="read_file">
  <parameter name="path">test/fixtures/lines.txt</parameter>
  <parameter name="offset">2</parameter>
  <parameter name="limit">2</parameter>
</invoke>
</tool_calls>`

test('parses and executes a ranged read_file call from streamed XML', async (t) => {
	const [call] = parseToolCalls(reportedToolCall)
	t.truthy(call)
	if (!call) return

	const result = await executeTool(call)
	t.deepEqual(result, {
		ok: true,
		tool_name: 'read_file',
		result: 'second\nthird',
	})
})

test('falls back to a tool call emitted in thinking content', (t) => {
	const parsed = parseResponseToolCalls('', reportedToolCall)

	t.is(parsed.sourceContent, reportedToolCall)
	t.deepEqual(parsed.calls, [
		{
			name: 'read_file',
			arguments: {
				path: 'test/fixtures/lines.txt',
				offset: '2',
				limit: '2',
			},
		},
	])
})

test('parses search and edit calls from the same streamed batch', (t) => {
	const calls = parseToolCalls(`<tool_calls>
<invoke name="search_files">
  <parameter name="path">source</parameter>
  <parameter name="query">parseToolCalls</parameter>
</invoke>
<invoke name="edit_file">
  <parameter name="path">source/example.ts</parameter>
  <parameter name="old_text">before</parameter>
  <parameter name="new_text">after</parameter>
</invoke>
</tool_calls>`)

	t.deepEqual(
		calls.map((call) => call.name),
		['search_files', 'edit_file']
	)
})

test('hides partial tool markup while reasoning content streams', (t) => {
	t.is(hideStreamingToolCalls('Checking the file.\n<tool_ca'), 'Checking the file.\n')
	t.is(hideStreamingToolCalls(`Checking the file.\n${reportedToolCall}`), 'Checking the file.\n')
})
