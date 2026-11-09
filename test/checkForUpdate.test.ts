import ava, { type TestFn } from 'ava'
import { checkForUpdate } from '../source/core/checkForUpdate.js'

const test = ava as unknown as TestFn

test.serial('announces a newer npm version on the first check', async (t) => {
	const originalFetch = globalThis.fetch
	t.teardown(() => {
		globalThis.fetch = originalFetch
	})
	globalThis.fetch = async (url, options) => {
		t.is(url, 'https://registry.npmjs.org/%40rezaparsian%2Frp-cli/latest')
		t.truthy(options?.signal)
		return new Response(JSON.stringify({ version: '0.11.0' }))
	}
	t.is(
		await checkForUpdate('@rezaparsian/rp-cli', '0.10.0'),
		'Update available: 0.10.0 → 0.11.0\nRun npm install --global @rezaparsian/rp-cli@latest to update.\n'
	)
	t.is(await checkForUpdate('@rezaparsian/rp-cli', '0.11.0'), undefined)
	t.is(await checkForUpdate('@rezaparsian/rp-cli', '0.12.0'), undefined)
})

test.serial('ignores registry errors and malformed versions', async (t) => {
	const originalFetch = globalThis.fetch
	t.teardown(() => {
		globalThis.fetch = originalFetch
	})
	for (const body of [{ version: 'invalid' }, {}, { version: 12 }]) {
		globalThis.fetch = async () => new Response(JSON.stringify(body))
		t.is(await checkForUpdate('example', '1.0.0'), undefined)
	}
	globalThis.fetch = async () => new Response('', { status: 503 })
	t.is(await checkForUpdate('example', '1.0.0'), undefined)
	globalThis.fetch = async () => {
		throw new Error('Network unavailable')
	}
	t.is(await checkForUpdate('example', '1.0.0'), undefined)
})
