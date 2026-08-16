export type ServerOptions = {
	port?: number
	host?: string
}

export type ChatMessageContent = string | Array<string | { type?: string; text?: string }> | null

export type ChatMessage = {
	role?: string
	content?: ChatMessageContent
	name?: string
	tool_call_id?: string
}

export type FunctionTool = {
	type: 'function'
	function: {
		name: string
		description?: string
		parameters?: Record<string, unknown>
	}
}

export type ToolChoice = 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } }
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type ClientToolCall = {
	id: string
	type: 'function'
	function: { name: string; arguments: string }
}

export type ChatCompletionRequest = {
	model?: string
	messages?: ChatMessage[]
	stream?: boolean
	stream_options?: { include_usage?: boolean }
	n?: number
	thinking_enabled?: boolean
	reasoning_effort?: ReasoningEffort
	search_enabled?: boolean
	temperature?: number
	max_tokens?: number
	tools?: FunctionTool[]
	tool_choice?: ToolChoice
}

export type CompletionUsage = {
	prompt_tokens: number
	completion_tokens: number
	total_tokens: number
}
