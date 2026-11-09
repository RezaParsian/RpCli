import { promises as fs } from 'node:fs'
import { safePath } from '../tools/paths.js'

export function formatFileMention(file: string): string {
	return /[\s"']/.test(file) ? `@${JSON.stringify(file)}` : `@${file}`
}

/** Attach local references once, before sending the user's request to the model. */
export async function attachFileMentions(prompt: string): Promise<string> {
	const pattern = /(?:^|\s)@(?:"((?:\\.|[^"\\])*)"|'([^']+)'|([^\s"']+))/g
	const seen = new Set<string>()
	const attachments: Array<{ path: string; content?: string; entries?: string[] }> = []
	for (const match of prompt.matchAll(pattern)) {
		const requestedPath = match[1] === undefined ? match[2] ?? match[3] ?? '' : (JSON.parse(`"${match[1]}"`) as string)
		try {
			const filePath = await safePath(requestedPath)
			if (seen.has(filePath)) continue
			seen.add(filePath)
			const stats = await fs.stat(filePath)
			if (stats.isDirectory()) {
				const entries = await fs.readdir(filePath, { withFileTypes: true })
				attachments.push({
					path: requestedPath,
					entries: entries.map((entry) => entry.name + (entry.isDirectory() ? '/' : '')),
				})
				continue
			}

			if (!stats.isFile()) throw new Error('Not a regular file.')
			if (stats.size > 100 * 1024) throw new Error('File is larger than 100 KiB.')
			const bytes = await fs.readFile(filePath)
			if (bytes.includes(0)) throw new Error('Binary files cannot be attached.')
			const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
			attachments.push({ path: requestedPath, content })
		} catch (error) {
			throw new Error(`Could not attach @${requestedPath}: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	return attachments.length > 0 ? `${prompt}\n\nAttached local files (JSON):\n${JSON.stringify(attachments)}` : prompt
}
