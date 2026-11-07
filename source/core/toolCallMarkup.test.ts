import ava, { type TestFn } from 'ava'
import { createToolCallMarkupNormalizer, normalizeToolCallMarkup } from './toolCallMarkup.js'

const test = ava as unknown as TestFn

test('preserves JSON payloads with literal legacy markup', (t) => {
	const input = '```tool_call\nname: write_file\ninput: {"content":"<｜DSML｜calls><calls>text</calls>"}\n```'
	t.is(normalizeToolCallMarkup(input), input)
	const normalize = createToolCallMarkupNormalizer()
	t.is([...input].map((chunk) => normalize(chunk)).join('') + normalize('', true), input)
})
