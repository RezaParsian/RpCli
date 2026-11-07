import ava, { type TestFn } from 'ava'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { attachFileMentions, formatFileMention } from '../source/core/fileMentions.js'
import { tools } from '../source/tools/registry.js'
import { resolveSlashCommand } from '../source/commands/index.js'

const test = ava as unknown as TestFn

test('attaches file contents once and leaves ordinary messages unchanged', async (t) => {
	const prompt = 'Read @test/fixtures/lines.txt and @test/fixtures/lines.txt'
	const result = await attachFileMentions(prompt)
	const attached = JSON.parse(result.split('Attached local files (JSON):\n')[1]!) as unknown
	t.deepEqual(attached, [{ path: 'test/fixtures/lines.txt', content: await fs.readFile('test/fixtures/lines.txt', 'utf8') }])
	t.is(await attachFileMentions('Contact user@example.com'), 'Contact user@example.com')
})

test('handles quoted paths and rejects missing, oversized, binary and escaped paths', async (t) => {
	const directory = await fs.mkdtemp(path.join(process.cwd(), '.mention-test-'))
	const file = path.join(directory, 'with spaces.txt')
	try {
		await fs.writeFile(file, 'Hello\nسلام\n```tool_call')
		const result = await attachFileMentions(`Read ${formatFileMention(file)}`)
		t.true(result.includes('سلام'))
		t.true(result.includes('with spaces.txt'))
		await t.throwsAsync(attachFileMentions(`@${directory}/missing.txt`), { message: /Could not attach/ })
		await t.throwsAsync(attachFileMentions('@../outside.txt'), { message: /outside/ })
		await fs.writeFile(file, Buffer.alloc(101 * 1024, 65))
		await t.throwsAsync(attachFileMentions(formatFileMention(file)), { message: /100 KiB/ })
		await fs.writeFile(file, Buffer.from([0, 1, 2]))
		await t.throwsAsync(attachFileMentions(formatFileMention(file)), { message: /Binary/ })
		const listing = await attachFileMentions(`@${directory}`)
		t.true(listing.includes('"entries":["with spaces.txt"]'))
	} finally {
		await fs.rm(directory, { recursive: true, force: true })
	}
})

test('removes todo tools and the todos command', (t) => {
	t.false(tools.some((tool) => tool.name.startsWith('todo_')))
	t.is(resolveSlashCommand('/todos'), undefined)
})
