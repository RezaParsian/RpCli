import ava, { type TestFn } from 'ava'
import React from 'react'
import { render } from 'ink-testing-library'
import { useChatSession } from '../source/components/chat/useChatSession.js'
import { resetChatSession } from '../source/core/apiClient.js'

const test = ava as unknown as TestFn

test.serial('a failed initialization can be retried on the next send', async (t) => {
	const originalFetch = globalThis.fetch
	let attempts = 0
	globalThis.fetch = async () => {
		attempts += 1
		throw new Error('Server busy')
	}
	resetChatSession()
	let session: ReturnType<typeof useChatSession> | undefined
	function Harness() {
		session = useChatSession({ token: 'test-token', onInvalidToken() {}, setMessages() {} })
		return null
	}

	const view = render(React.createElement(Harness))
	try {
		if (!session) throw new Error('Hook did not mount')
		await session.ensureSession()
		t.is(attempts, 1)
		t.false(session.initializationSucceeded.current)
		t.is(session.initialization.current, undefined)
		await session.ensureSession()
		t.is(attempts, 2)
		t.is(session.initialization.current, undefined)
	} finally {
		view.unmount()
		view.cleanup()
		globalThis.fetch = originalFetch
		resetChatSession()
	}
})
