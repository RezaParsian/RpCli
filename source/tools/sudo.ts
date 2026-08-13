import type { ToolCall } from './types.js'

export function commandContainsSudo(command: string): boolean {
	return /\bsudo\b/i.test(command)
}

export function stripSudo(command: string): string {
	return command
		.replace(/\bsudo(?:\s+(?:-[a-zA-Z]+|--[a-zA-Z][\w-]*))*\s*/gi, ' ')
		.replace(/\bsudo\b/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

export function commandNeedsElevation(call: ToolCall): boolean {
	if (call.name !== 'run_command') return false
	const command = typeof call.arguments['command'] === 'string' ? call.arguments['command'] : ''
	return commandContainsSudo(command)
}
