import { promises as fs } from 'node:fs'
import path from 'node:path'

export default async function listWorkspaceFiles(rootDirectory = process.cwd()): Promise<string[]> {
	const files: string[] = []
	const pendingDirectories = ['']

	while (pendingDirectories.length > 0) {
		const relativeDirectory = pendingDirectories.pop() ?? ''
		let entries

		try {
			entries = await fs.readdir(path.join(rootDirectory, relativeDirectory), {
				withFileTypes: true,
			})
		} catch {
			// An unreadable folder should not prevent mentions from working elsewhere.
			continue
		}

		for (const entry of entries) {
			const relativePath = path.join(relativeDirectory, entry.name)
			if (entry.isDirectory()) {
				pendingDirectories.push(relativePath)
			} else if (entry.isFile()) {
				files.push(relativePath.split(path.sep).join('/'))
			}
		}
	}

	return files
}
