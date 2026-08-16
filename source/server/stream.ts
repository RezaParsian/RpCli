import { type Response } from 'express'

export function writeSse(res: Response, payload: unknown): void {
	res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

export function streamChunk(
	res: Response,
	id: string,
	created: number,
	model: string,
	delta: Record<string, unknown>,
	finishReason: string | null = null
): void {
	writeSse(res, {
		id,
		object: 'chat.completion.chunk',
		created,
		model,
		system_fingerprint: null,
		choices: [{ index: 0, delta, logprobs: null, finish_reason: finishReason }],
	})
}
