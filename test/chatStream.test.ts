import ava, { type TestFn } from 'ava'
import chat, { type ChatStreamChunk } from '../core-lib/Chat.js'

const test = ava as unknown as TestFn

async function replay(events: unknown[]) {
	const originalFetch = globalThis.fetch
	const bytes = new TextEncoder().encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''))
	globalThis.fetch = async () =>
		new Response(
			new ReadableStream({
				start(controller) {
					for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7))
					controller.close()
				},
			}),
			{ headers: { 'content-type': 'text/event-stream' } }
		)
	const chunks: ChatStreamChunk[] = []
	try {
		const result = await chat({
			token: 'test',
			challenge: 'test',
			sessionId: 'test',
			parentMessageId: null,
			prompt: 'salam',
			onChunk: (chunk) => chunks.push(chunk),
		})
		return { result, chunks }
	} finally {
		globalThis.fetch = originalFetch
	}
}

for (const operation of [undefined, 'SET', 'APPEND']) {
	test.serial(`separates thinking from response when fragments arrive with ${operation ?? 'no operation'}`, async (t) => {
		const thinking = { id: 2, type: 'THINK', content: 'No tool needed.' }
		const answer = { id: 3, type: 'RESPONSE', content: 'S' }
		const { result, chunks } = await replay([
			{ v: { response: { message_id: 4, fragments: [{ ...thinking, content: 'No' }] } } },
			{ p: 'response/fragments/-1/content', o: 'APPEND', v: ' tool needed.' },
			{ p: 'response/fragments/-1/elapsed_secs', o: 'SET', v: 0.6 },
			{ p: 'response/fragments', o: operation, v: operation === 'APPEND' ? [answer] : [thinking, answer] },
			{ p: 'response/fragments/-1/content', o: 'APPEND', v: 'alam!' },
			{ v: ' 👋 سلام' },
			{ p: 'response/status', o: 'SET', v: 'FINISHED' },
		])
		t.is(result.content, 'Salam! 👋 سلام')
		t.is(result.thinkingContent, 'No tool needed.')
		t.true(result.finished)
		t.is(
			chunks
				.filter((chunk) => chunk.type === 'response')
				.map((chunk) => chunk.content)
				.join(''),
			result.content ?? ''
		)
		t.is(
			chunks
				.filter((chunk) => chunk.type === 'thinking')
				.map((chunk) => chunk.content)
				.join(''),
			result.thinkingContent ?? ''
		)
	})
}

test.serial('does not duplicate snapshot text and applies content patches to the specified fragment', async (t) => {
	const snapshot = [
		{ type: 'THINK', content: 'Think' },
		{ type: 'RESPONSE', content: 'Answer' },
	]
	const { result, chunks } = await replay([
		{ v: { response: { message_id: 2, fragments: snapshot } } },
		{ p: 'response/fragments', v: snapshot },
		{ p: 'response/fragments/0/content', o: 'APPEND', v: '.' },
		{ p: 'response/fragments/1/content', o: 'SET', v: 'Answer!' },
		{ p: 'response/fragments/-1/type', o: 'SET', v: 'RESPONSE' },
		{ p: 'response/status', o: 'SET', v: 'FINISHED' },
	])
	t.is(result.content, 'Answer!')
	t.is(result.thinkingContent, 'Think.')
	t.is(
		chunks
			.filter((chunk) => chunk.type === 'response')
			.map((chunk) => chunk.content)
			.join(''),
		'Answer!'
	)
})

test.serial('still handles flat response streams', async (t) => {
	const { result } = await replay([
		{ v: { response: { message_id: 2, content: 'S' } } },
		{ p: 'response/content', o: 'APPEND', v: 'alam' },
		{ v: '!' },
		{ p: 'response/status', o: 'SET', v: 'FINISHED' },
	])
	t.is(result.content, 'Salam!')
	t.is(result.thinkingContent, '')
})
