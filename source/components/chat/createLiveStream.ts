import type { ChatMessage } from './types.js'

type LiveStream = {
	messages: ChatMessage[]
	upsert: (message: ChatMessage) => void
	append: (message: ChatMessage) => void
	flush: () => void
	scheduleFlush: () => void
	dispose: () => void
}

export function createLiveStream(onFlush: (messages: ChatMessage[]) => void): LiveStream {
	let liveMessages: ChatMessage[] = []
	let throttleTimer: NodeJS.Timeout | undefined
	let lastFlush = 0

	const flush = () => {
		if (throttleTimer) {
			clearTimeout(throttleTimer)
		}

		throttleTimer = undefined
		onFlush([...liveMessages])
	}

	return {
		get messages() {
			return liveMessages
		},
		upsert(message) {
			const index = liveMessages.findIndex((item) => item.id === message.id)

			if (index === -1) {
				liveMessages = [...liveMessages, message]
				return
			}

			liveMessages = liveMessages.map((item, itemIndex) => (itemIndex === index ? message : item))
		},
		append(message) {
			liveMessages = [...liveMessages, message]
		},
		flush,
		scheduleFlush() {
			const now = Date.now()
			const remaining = 50 - (now - lastFlush)

			if (remaining <= 0) {
				lastFlush = now
				flush()
				return
			}

			if (!throttleTimer) {
				throttleTimer = setTimeout(() => {
					lastFlush = Date.now()
					flush()
				}, remaining)
			}
		},
		dispose() {
			if (throttleTimer) {
				clearTimeout(throttleTimer)
			}

			throttleTimer = undefined
		},
	}
}
