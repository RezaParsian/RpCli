import { promises as fs } from 'node:fs'
import { stringArgument, textArgument } from './arguments.js'
import { formatDiff } from './diff.js'
import { safePath } from './paths.js'
import { commandContainsSudo } from './sudo.js'
import type { ToolCall, ToolConfirmationDetails } from './types.js'

export async function describeToolConfirmation(call: ToolCall): Promise<ToolConfirmationDetails> {
	const requestedPath = typeof call.arguments['path'] === 'string' ? call.arguments['path'] : '.'

	switch (call.name) {
		case 'list_directory': {
			return {
				title: 'List directory?',
				description: `List entries in ${requestedPath}`,
			}
		}
		case 'read_file': {
			return {
				title: 'Read file?',
				description: `Read ${requestedPath}`,
			}
		}
		case 'write_file': {
			const content = textArgument(call.arguments, 'content')
			let previousContent = ''
			let action = 'Create'

			try {
				const filePath = await safePath(requestedPath)
				previousContent = await fs.readFile(filePath, 'utf8')
				action = 'Overwrite'
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
			}

			return {
				title: `${action} file?`,
				description: `${action} ${requestedPath}`,
				diff: formatDiff(requestedPath, previousContent, content),
			}
		}
		case 'edit_file': {
			await safePath(requestedPath)
			const oldText = stringArgument(call.arguments, 'old_text')
			const newText = textArgument(call.arguments, 'new_text')

			return {
				title: 'Edit file?',
				description: `Update ${requestedPath}`,
				diff: formatDiff(requestedPath, oldText, newText),
			}
		}
		case 'delete_file': {
			return {
				title: 'Delete file?',
				description: `${requestedPath} will be permanently deleted.`,
			}
		}
		case 'search_files': {
			const query = stringArgument(call.arguments, 'query')
			return {
				title: 'Search files?',
				description: `Search for "${query}" in ${requestedPath}`,
			}
		}
		case 'run_command': {
			const command = stringArgument(call.arguments, 'command')
			if (commandContainsSudo(command)) {
				return {
					title: 'Run elevated command?',
					description: `${command}\n\nAn operating-system authorization dialog will open.`,
				}
			}

			return {
				title: 'Run command?',
				description: command,
			}
		}
		default: {
			return {
				title: `Allow ${call.name}?`,
				description: `Run the unrecognized tool "${call.name}"`,
			}
		}
	}
}

export function describeToolActivity(call: ToolCall): string {
	const pathValue = typeof call.arguments['path'] === 'string' ? call.arguments['path'] : '.'
	const pathLabel = pathValue === '.' ? 'the current directory' : pathValue

	switch (call.name) {
		case 'list_directory': {
			return `Listing ${pathLabel}...`
		}
		case 'read_file': {
			return `Reading ${pathLabel}...`
		}
		case 'write_file': {
			return `Writing to ${pathLabel}...`
		}
		case 'edit_file': {
			return `Editing ${pathLabel}...`
		}
		case 'delete_file': {
			return `Deleting ${pathLabel}...`
		}
		case 'search_files': {
			const query = typeof call.arguments['query'] === 'string' ? call.arguments['query'] : ''
			return `Searching for "${query}" in ${pathLabel}...`
		}
		case 'run_command': {
			const command = typeof call.arguments['command'] === 'string' ? call.arguments['command'] : ''
			return commandContainsSudo(command) ? `Running elevated command: ${command}` : `Running command: ${command}`
		}
		default: {
			return `Running ${call.name}...`
		}
	}
}

/**
 * Replaces the <tool_calls> block in the assistant's raw content with short
 * activity descriptions. Useful for rendering a live "doing X, then Y..."
 * status instead of showing the raw tags while a batch executes.
 */
export function formatToolActivityMessage(assistantContent: string, calls: ToolCall[]): string {
	const activity = calls.map((call) => `⚙  ${describeToolActivity(call)}`).join('\n')
	return assistantContent.replace(/<tool_calls>[\s\S]*?<\/tool_calls>/g, activity)
}
