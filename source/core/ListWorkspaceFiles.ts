import { promises as fs } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ALWAYS_IGNORED_NAMES, isIgnored, parseGitignore, type IgnoreRule } from './Gitignore.js'

const execFileAsync = promisify(execFile)

async function listGitFiles(rootDirectory: string): Promise<string[]> {
	const { stdout } = await execFileAsync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', '.'], {
		cwd: rootDirectory,
		maxBuffer: 16 * 1024 * 1024,
	})

	return stdout
		.split('\n')
		.map((file) => file.trim())
		.filter(Boolean)
		.map((file) => file.split(path.sep).join('/'))
}

async function walkWithIgnores(rootDirectory: string, relativeDirectory: string, rules: IgnoreRule[]): Promise<string[]> {
	const directory = path.join(rootDirectory, relativeDirectory)
	let entries

	try {
		entries = await fs.readdir(directory, { withFileTypes: true })
	} catch {
		return []
	}

	let directoryRules = rules
	const gitignore = entries.find((entry) => entry.isFile() && entry.name === '.gitignore')
	if (gitignore) {
		try {
			const content = await fs.readFile(path.join(directory, '.gitignore'), 'utf8')
			directoryRules = [...rules, ...parseGitignore(content, relativeDirectory.split(path.sep).join('/'))]
		} catch {
			// A missing or unreadable gitignore should not hide the rest of the tree.
		}
	}

	const files: string[] = []

	for (const entry of entries) {
		if (ALWAYS_IGNORED_NAMES.has(entry.name)) continue

		const relativePath = path.join(relativeDirectory, entry.name).split(path.sep).join('/')
		if (isIgnored(relativePath, entry.isDirectory(), directoryRules)) continue

		if (entry.isDirectory()) {
			files.push(...(await walkWithIgnores(rootDirectory, relativePath, directoryRules)))
		} else if (entry.isFile()) {
			files.push(relativePath)
		}
	}

	return files
}

export default async function listWorkspaceFiles(rootDirectory = process.cwd()): Promise<string[]> {
	try {
		return await listGitFiles(rootDirectory)
	} catch {
		return walkWithIgnores(rootDirectory, '', [])
	}
}
