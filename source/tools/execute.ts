import { tools } from './registry.js'
import { commandNeedsElevation } from './sudo.js'
import type { ConfirmationHandler, ToolCall, ToolMode, ToolResult } from './types.js'

function formatToolOutput(value: unknown): string {
	if (typeof value === 'string') return value

	if (Array.isArray(value)) return value.join('\n')

	if (value && typeof value === 'object' && ('stdout' in value || 'stderr' in value)) {
		const { stdout, stderr } = value as { stdout?: string; stderr?: string }
		const parts: string[] = []
		if (stdout?.trim()) parts.push(stdout.trimEnd())
		if (stderr?.trim()) parts.push(`stderr:\n${stderr.trimEnd()}`)
		return parts.length > 0 ? parts.join('\n\n') : '(no output)'
	}

	return JSON.stringify(value, null, 2)
}

export async function executeTool(call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
	const tool = tools.find((candidate) => candidate.name === call.name)

	if (!tool) return { ok: false, tool_name: call.name, error: 'Unknown tool' }

	try {
		const result = await tool.execute(call.arguments, signal)
		return { ok: true, tool_name: call.name, result: formatToolOutput(result) }
	} catch (error) {
		return {
			ok: false,
			tool_name: call.name,
			error: error instanceof Error ? error.message : String(error),
		}
	}
}

/**
 * Executes a batch of tool calls sequentially, in the order they were parsed.
 * - Stops (does not execute) the batch as soon as a declined confirmation is hit.
 * - Individual tool failures do NOT stop the batch; they're recorded as ok: false
 *   in that call's result and execution continues with the next call, so the model
 *   sees every outcome and can decide how to proceed.
 * - Calls skipped because of a declined confirmation are recorded as
 *   ok: false with a "Skipped" error, so the model always gets one ToolResult
 *   per ToolCall it made.
 */
export async function executeToolCalls(
	calls: ToolCall[],
	onConfirm: ConfirmationHandler,
	mode: ToolMode,
	signal?: AbortSignal
): Promise<ToolResult[]> {
	const results: ToolResult[] = []
	let declined = false

	for (const call of calls) {
		if (signal?.aborted) break

		if (declined) {
			results.push({
				ok: false,
				tool_name: call.name,
				error: 'Skipped: a previous tool call in this batch was declined.',
			})
			continue
		}

		if (mode === 'plan' && toolIsMutating(call)) {
			results.push({
				ok: false,
				tool_name: call.name,
				error: 'Plan mode is read-only. File changes and shell commands are blocked. Describe the plan instead. After you present a plan, wait for the user to approve it.',
			})
			continue
		}

		if (toolRequiresConfirmation(call, mode)) {
			let confirmed: boolean
			try {
				confirmed = await onConfirm(call)
			} catch (error) {
				results.push({
					ok: false,
					tool_name: call.name,
					error: `Could not prepare confirmation: ${error instanceof Error ? error.message : String(error)}`,
				})
				continue
			}

			if (!confirmed) {
				declined = true
				results.push({
					ok: false,
					tool_name: call.name,
					error: 'User declined this action.',
				})
				continue
			}
		}

		results.push(await executeTool(call, signal))
	}

	return results
}

export function toolIsMutating(call: ToolCall): boolean {
	if (commandNeedsElevation(call)) return true

	return tools.find((tool) => tool.name === call.name)?.requiresConfirmation ?? false
}

export function toolRequiresConfirmation(call: ToolCall, mode: ToolMode): boolean {
	if (mode === 'plan') return false
	if (commandNeedsElevation(call)) return true
	if (mode === 'yolo') return false

	return tools.find((tool) => tool.name === call.name)?.requiresConfirmation ?? false
}
