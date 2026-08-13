export type ToolCall = {
	name: string
	arguments: Record<string, unknown>
}

export type ToolResult = {
	ok: boolean
	tool_name: string
	error?: string
	result?: string
}

export type ToolConfirmationDetails = {
	title: string
	description: string
	diff?: string
}

export type Tool = {
	name: string
	description: string
	execute: (arguments_: Record<string, unknown>) => Promise<unknown>
	requiresConfirmation?: boolean
}

export type ToolMode = 'plan' | 'normal' | 'yolo'

export type ConfirmationHandler = (call: ToolCall) => Promise<boolean>
