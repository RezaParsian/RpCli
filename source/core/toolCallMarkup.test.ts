import test from 'ava'
import { createToolCallMarkupNormalizer, normalizeToolCallMarkup } from './toolCallMarkup.js'

test('normalizes complete DSML tool calls', (t) => {
	const input =
		'<｜DSML｜calls><｜DSML｜invoke name="run_command"><｜DSML｜parameter name="command">pwd</｜DSML｜parameter></｜DSML｜invoke></｜DSML｜calls>'
	t.is(
		normalizeToolCallMarkup(input),
		'<tool_calls><invoke name="run_command"><parameter name="command">pwd</parameter></invoke></tool_calls>'
	)
})

test('normalizes markup split across stream chunks before emitting it', (t) => {
	const normalize = createToolCallMarkupNormalizer()
	const chunks = [
		'Before ',
		'<｜DS',
		'ML｜calls>',
		'<｜DSML｜invoke name="run_command">',
		'</｜DSML｜invoke>',
		'</｜DSML｜calls>',
		' After',
	]
	const output = chunks.map((chunk) => normalize(chunk)).join('') + normalize('', true)
	t.is(output, 'Before <tool_calls><invoke name="run_command"></invoke></tool_calls> After')
})

test('does not hold ordinary text containing a less-than sign', (t) => {
	const normalize = createToolCallMarkupNormalizer()
	t.is(normalize('Value is <'), 'Value is ')
	t.is(normalize(' 5 and counting'), '< 5 and counting')
})
