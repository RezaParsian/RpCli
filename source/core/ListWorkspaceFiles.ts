import {promises as fs} from 'node:fs';
import path from 'node:path';

const ignoredDirectories = new Set(['.git', 'dist', 'node_modules']);
const maximumFiles = 10_000;

export default async function listWorkspaceFiles(
	rootDirectory = process.cwd(),
): Promise<string[]> {
	const files: string[] = [];
	const pendingDirectories = [''];

	while (pendingDirectories.length > 0 && files.length < maximumFiles) {
		const relativeDirectory = pendingDirectories.pop() ?? '';
		let entries;

		try {
			entries = await fs.readdir(path.join(rootDirectory, relativeDirectory), {
				withFileTypes: true,
			});
		} catch {
			// An unreadable folder should not prevent mentions from working elsewhere.
			continue;
		}

		for (const entry of entries) {
			if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

			const relativePath = path.join(relativeDirectory, entry.name);
			if (entry.isDirectory()) {
				pendingDirectories.push(relativePath);
			} else if (entry.isFile()) {
				files.push(relativePath.split(path.sep).join('/'));
				if (files.length >= maximumFiles) break;
			}
		}
	}

	return files;
}
