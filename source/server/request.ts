import crypto from 'node:crypto'
import { ApiError } from './errors.js'
import {
	type ChatCompletionRequest,
	type ChatMessage,
	type ChatMessageContent,
	type ClientToolCall,
	type CompletionUsage,
	type FunctionTool,
	type ReasoningEffort,
	type ToolChoice,
} from './types.js'

export function generateCompletionId(): string {
	return `chatcmpl-${crypto.randomBytes(12).toString('hex')}`
}

function generateToolCallId(): string {
	return `call_${crypto.randomBytes(12).toString('hex')}`
}

export function resolveModel(model: string | undefined): { id: string; thinkingEnabled: boolean } {
	if (!model || model === 'deepseek-chat') return { id: 'deepseek-chat', thinkingEnabled: false }
	if (model === 'deepseek-reasoner' || /reasoner|\br1\b/i.test(model)) return { id: model, thinkingEnabled: true }
	return { id: model, thinkingEnabled: false }
}

export function resolveThinkingEnabled(body: ChatCompletionRequest, modelDefault: boolean): boolean {
	if (body.thinking_enabled !== undefined) return body.thinking_enabled
	if (body.reasoning_effort === undefined) return modelDefault

	const supportedEfforts: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
	if (!supportedEfforts.includes(body.reasoning_effort)) {
		throw new ApiError(
			400,
			`Unsupported reasoning effort: ${String(body.reasoning_effort)}`,
			'invalid_request_error',
			'unsupported_value',
			'reasoning_effort'
		)
	}

	return body.reasoning_effort !== 'none' && body.reasoning_effort !== 'minimal'
}

function messageText(content: ChatMessageContent | undefined): string {
	if (content == null) return ''
	if (typeof content === 'string') return content
	if (!Array.isArray(content)) return String(content)

	return content
		.map((part) => (typeof part === 'string' ? part : part && typeof part.text === 'string' ? part.text : ''))
		.filter(Boolean)
		.join('\n')
}

export function buildCompletionPrompt(messages: ChatMessage[]): string {
	const lastMessage = messages[messages.length - 1]
	const content = messageText(lastMessage?.content).trim()
	if (!content) {
		throw new ApiError(
			400,
			"The last item in 'messages' must contain content",
			'invalid_request_error',
			'invalid_messages',
			'messages'
		)
	}

	if (lastMessage?.role !== 'tool') return content

	const attributes = [
		lastMessage.tool_call_id ? `tool_call_id="${lastMessage.tool_call_id}"` : '',
		lastMessage.name ? `name="${lastMessage.name}"` : '',
	]
		.filter(Boolean)
		.join(' ')
	return `<tool_result${
		attributes ? ` ${attributes}` : ''
	}>\n${content}\n</tool_result>\nContinue the answer using this tool result.`
}

export function validateTools(tools: FunctionTool[] | undefined): FunctionTool[] {
	if (tools === undefined) return []
	if (!Array.isArray(tools)) {
		throw new ApiError(400, "'tools' must be an array", 'invalid_request_error', 'invalid_tools', 'tools')
	}

	for (const [index, tool] of tools.entries()) {
		if (
			tool?.type !== 'function' ||
			!tool.function ||
			typeof tool.function.name !== 'string' ||
			!/^[A-Za-z0-9_-]{1,64}$/.test(tool.function.name)
		) {
			throw new ApiError(
				400,
				`Invalid function tool at index ${index}`,
				'invalid_request_error',
				'invalid_tool',
				`tools.${index}`
			)
		}
	}

	return tools
}

export function withToolInstructions(prompt: string, tools: FunctionTool[], choice: ToolChoice | undefined): string {
	if (tools.length === 0 || choice === 'none') return prompt
	if (
		choice !== undefined &&
		choice !== 'auto' &&
		choice !== 'required' &&
		(typeof choice !== 'object' || choice === null || choice.type !== 'function' || typeof choice.function?.name !== 'string')
	) {
		throw new ApiError(400, "Invalid 'tool_choice'", 'invalid_request_error', 'invalid_tool_choice', 'tool_choice')
	}

	let choiceInstruction = 'Call a function only when it helps answer the request.'
	if (choice === 'required') choiceInstruction = 'You must call at least one function.'
	if (typeof choice === 'object') {
		const selectedName = choice.function?.name
		if (!tools.some((tool) => tool.function.name === selectedName)) {
			throw new ApiError(
				400,
				`Unknown required function: ${selectedName}`,
				'invalid_request_error',
				'invalid_tool_choice',
				'tool_choice'
			)
		}

		choiceInstruction = `You must call the function named "${selectedName}".`
	}

	return `${prompt}\n\nAvailable client functions:\n${JSON.stringify(
		tools,
		null,
		2
	)}\n\n${choiceInstruction}\nThe client, not you, executes functions. To call one or more functions, output only one block per call in this exact format:\n<function_call name="function_name">{"argument":"value"}</function_call>\nThe block body must be one valid JSON object matching the function parameters. Do not use Markdown fences.`
}

export function parseClientToolCalls(content: string): { content: string; calls: ClientToolCall[] } {
	const calls: ClientToolCall[] = []
	const pattern = /<function_call\s+name="([^"]+)">\s*([\s\S]*?)\s*<\/function_call>/g
	let match: RegExpExecArray | null

	while ((match = pattern.exec(content)) !== null) {
		const name = match[1]
		const rawArguments = match[2]
		if (!name || rawArguments === undefined) continue

		let parsedArguments: unknown
		try {
			parsedArguments = JSON.parse(rawArguments)
		} catch {
			throw new ApiError(
				500,
				`The model returned invalid arguments for function "${name}"`,
				'server_error',
				'invalid_tool_arguments'
			)
		}

		if (!parsedArguments || typeof parsedArguments !== 'object' || Array.isArray(parsedArguments)) {
			throw new ApiError(
				500,
				`The model returned non-object arguments for function "${name}"`,
				'server_error',
				'invalid_tool_arguments'
			)
		}

		calls.push({
			id: generateToolCallId(),
			type: 'function',
			function: { name, arguments: JSON.stringify(parsedArguments) },
		})
	}

	return { content: content.replace(pattern, '').trim(), calls }
}

export function toUsage(tokenUsage: unknown): CompletionUsage | undefined {
	if (!tokenUsage || typeof tokenUsage !== 'object') return undefined

	const usage = tokenUsage as Record<string, unknown>
	const promptTokens = Number(usage['prompt_tokens'] ?? usage['input_tokens'] ?? 0) || 0
	const completionTokens = Number(usage['completion_tokens'] ?? usage['output_tokens'] ?? 0) || 0
	const totalTokens = Number(usage['total_tokens'] ?? usage['total'] ?? promptTokens + completionTokens) || 0
	if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) return undefined

	return { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens }
}
