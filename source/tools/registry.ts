import { promises as fs } from 'node:fs'
import path from 'node:path'
import { exec as execCallback } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import listWorkspaceFiles from '../core/ListWorkspaceFiles.js'
import { stringArgument, textArgument } from './arguments.js'
import { rootDirectory, safePath, safeTargetPath } from './paths.js'
import { commandContainsSudo, stripSudo } from './sudo.js'
import type { Tool } from './types.js'

type SudoPromptCallback = (error?: Error, stdout?: string | Buffer, stderr?: string | Buffer) => void

type LegacyUtil = typeof import('node:util') & {
	isFunction?: (value: unknown) => boolean
	isObject?: (value: unknown) => boolean
}

const require = createRequire(import.meta.url)
const legacyUtil = require('node:util') as LegacyUtil
legacyUtil.isFunction ??= (value: unknown) => typeof value === 'function'
legacyUtil.isObject ??= (value: unknown) => value !== null && (typeof value === 'object' || typeof value === 'function')

const { exec: sudoExecCallback } = require('@slosk/sudo-prompt') as {
	exec: (command: string, options: { name: string; env: Record<string, string> }, callback: SudoPromptCallback) => void
}

const exec = promisify(execCallback)

function commandEnv(): Record<string, string> {
	const env: Record<string, string> = {}

	for (const [name, value] of Object.entries(process.env)) {
		if (value === undefined) continue
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) continue
		if (/[\r\n]/.test(value)) continue
		env[name] = value
	}

	return env
}

function elevatedExec(command: string): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		sudoExecCallback(command, { name: 'RP CLI', env: commandEnv() }, (error, stdout, stderr) => {
			if (error) {
				reject(error)
				return
			}

			resolve({
				stdout: stdout?.toString() ?? '',
				stderr: stderr?.toString() ?? '',
			})
		})
	})
}

async function listSearchFiles(directory: string): Promise<string[]> {
	const relativeDirectory = path.relative(rootDirectory, directory).split(path.sep).join('/')
	const files = await listWorkspaceFiles(rootDirectory)

	return files
		.filter((file) => {
			if (!relativeDirectory || relativeDirectory === '.') return true
			return file === relativeDirectory || file.startsWith(`${relativeDirectory}/`)
		})
		.map((file) => path.join(rootDirectory, file))
}

export const tools: Tool[] = [
	{
		name: 'list_directory',
		description:
			'list_directory(path?: string) - Lists files and directories at a path inside the current working directory.',
		requiresConfirmation: false,
		async execute(arguments_) {
			const requestedPath = stringArgument(arguments_, 'path', '.')
			const directory = await safePath(requestedPath)
			const entries = await fs.readdir(directory, { withFileTypes: true })
			return entries.map((entry) => `${entry.isDirectory() ? 'directory' : 'file'}\t${entry.name}`)
		},
	},
	{
		name: 'write_file',
		description:
			'write_file(path: string, content: string) - Creates or completely overwrites a UTF-8 file inside the current working directory.',
		requiresConfirmation: true,
		async execute(arguments_) {
			const filePath = await safeTargetPath(stringArgument(arguments_, 'path'))
			const content = textArgument(arguments_, 'content')
			await fs.writeFile(filePath, content, 'utf8')
			return `Wrote ${Buffer.byteLength(content, 'utf8')} bytes.`
		},
	},
	{
		name: 'edit_file',
		description:
			'edit_file(path: string, old_text: string, new_text: string) - Replaces one unique exact text occurrence in a UTF-8 file.',
		requiresConfirmation: true,
		async execute(arguments_) {
			const filePath = await safePath(stringArgument(arguments_, 'path'))
			const oldText = stringArgument(arguments_, 'old_text')
			const newText = textArgument(arguments_, 'new_text')
			const content = await fs.readFile(filePath, 'utf8')
			const firstIndex = content.indexOf(oldText)
			if (firstIndex === -1) throw new Error('old_text was not found in the file.')
			if (content.indexOf(oldText, firstIndex + oldText.length) !== -1) {
				throw new Error('old_text is not unique in the file.')
			}

			await fs.writeFile(
				filePath,
				content.slice(0, firstIndex) + newText + content.slice(firstIndex + oldText.length),
				'utf8'
			)
			return 'File edited successfully.'
		},
	},
	{
		name: 'delete_file',
		description:
			'delete_file(path: string) - Deletes one file inside the current working directory.',
		requiresConfirmation: true,
		async execute(arguments_) {
			const filePath = await safePath(stringArgument(arguments_, 'path'))
			const stats = await fs.stat(filePath)
			if (!stats.isFile()) throw new Error('The requested path is not a file.')
			await fs.unlink(filePath)
			return 'File deleted successfully.'
		},
	},
	{
		name: 'read_file',
		description: 'read_file(path: string) - Reads a UTF-8 text file inside the current working directory (maximum 100 KiB).',
		requiresConfirmation: false,
		async execute(arguments_) {
			const filePath = await safePath(stringArgument(arguments_, 'path'))
			const stats = await fs.stat(filePath)
			if (!stats.isFile()) throw new Error('The requested path is not a file.')
			if (stats.size > 100 * 1024) throw new Error('The requested file is larger than 100 KiB.')
			return fs.readFile(filePath, 'utf8')
		},
	},
	{
		name: 'search_files',
		description:
			'search_files(query: string, path?: string) - Searches text files under a path and returns up to 50 matching lines.',
		requiresConfirmation: false,
		async execute(arguments_) {
			const query = stringArgument(arguments_, 'query')
			const directory = await safePath(stringArgument(arguments_, 'path', '.'))
			const files = await listSearchFiles(directory)
			const matches: string[] = []

			for (const filePath of files) {
				if (matches.length >= 50) break

				const stats = await fs.stat(filePath)
				if (stats.size > 100 * 1024) continue

				const content = await fs.readFile(filePath, 'utf8')
				for (const [index, line] of content.split('\n').entries()) {
					if (line.includes(query)) {
						matches.push(`${path.relative(rootDirectory, filePath)}:${index + 1}:${line}`)
						if (matches.length >= 50) break
					}
				}
			}

			return matches
		},
	},
	{
		name: 'run_command',
		description:
			'run_command(command: string) - Runs a shell command in the current working directory. Include sudo anywhere in the command when administrator privileges are needed; an OS authorization dialog will open.',
		requiresConfirmation: true,
		async execute(arguments_) {
			const command = stringArgument(arguments_, 'command')
			if (commandContainsSudo(command)) {
				const elevatedCommand = stripSudo(command)
				if (!elevatedCommand) throw new Error('sudo was given with no command.')
				return elevatedExec(elevatedCommand)
			}

			const { stdout, stderr } = await exec(command, {
				cwd: rootDirectory,
				maxBuffer: 1024 * 1024,
			})
			return { stdout, stderr }
		},
	},
]

export function getToolDescriptions(): string[] {
	return tools.map((tool) => tool.description)
}
