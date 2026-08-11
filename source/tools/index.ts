import {promises as fs} from 'node:fs';
import path from 'node:path';
import {exec as execCallback} from 'node:child_process';
import {createRequire} from 'node:module';
import {promisify} from 'node:util';

type SudoPromptCallback = (
	error?: Error,
	stdout?: string | Buffer,
	stderr?: string | Buffer,
) => void;

type LegacyUtil = typeof import('node:util') & {
	isFunction?: (value: unknown) => boolean;
	isObject?: (value: unknown) => boolean;
};

const require = createRequire(import.meta.url);
const legacyUtil = require('node:util') as LegacyUtil;
legacyUtil.isFunction ??= (value: unknown) => typeof value === 'function';
legacyUtil.isObject ??= (value: unknown) =>
	value !== null && (typeof value === 'object' || typeof value === 'function');

const {exec: sudoExecCallback} = require('@slosk/sudo-prompt') as {
	exec: (
		command: string,
		options: {name: string; env: Record<string, string>},
		callback: SudoPromptCallback,
	) => void;
};

export type ToolCall = {
	name: string;
	arguments: Record<string, unknown>;
};

export type ToolResult = {
	ok: boolean;
	tool_name: string;
	error?: string;
	result?: string;
};

export type ToolConfirmationDetails = {
	title: string;
	description: string;
	diff?: string;
};

type Tool = {
	name: string;
	description: string;
	execute: (arguments_: Record<string, unknown>) => Promise<unknown>;
	requiresConfirmation?: boolean;
};

const rootDirectory = process.cwd();
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules']);
const exec = promisify(execCallback);

function elevatedExec(
	command: string,
): Promise<{stdout: string; stderr: string}> {
	return new Promise((resolve, reject) => {
		sudoExecCallback(
			command,
			{name: 'RP CLI', env: process.env as Record<string, string>},
			(error, stdout, stderr) => {
				if (error) {
					reject(error);
					return;
				}

				resolve({
					stdout: stdout?.toString() ?? '',
					stderr: stderr?.toString() ?? '',
				});
			},
		);
	});
}

function stringArgument(
	arguments_: Record<string, unknown>,
	name: string,
	fallback?: string,
): string {
	const value = arguments_[name] !== '' ? arguments_[name] : fallback;
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(`Argument "${name}" must be a non-empty string.`);
	}

	return value;
}

function textArgument(
	arguments_: Record<string, unknown>,
	name: string,
): string {
	const value = arguments_[name];
	if (typeof value !== 'string') {
		throw new TypeError(`Argument "${name}" must be a string.`);
	}

	return value;
}

async function safePath(requestedPath: string): Promise<string> {
	const resolvedPath = path.resolve(rootDirectory, requestedPath);
	const relativePath = path.relative(rootDirectory, resolvedPath);
	if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
		throw new Error(
			'The requested path is outside the current working directory.',
		);
	}

	const realPath = await fs.realpath(resolvedPath);
	const realRoot = await fs.realpath(rootDirectory);
	const realRelativePath = path.relative(realRoot, realPath);
	if (realRelativePath.startsWith('..') || path.isAbsolute(realRelativePath)) {
		throw new Error(
			'The requested path resolves outside the current working directory.',
		);
	}

	return realPath;
}

async function safeTargetPath(requestedPath: string): Promise<string> {
	const resolvedPath = path.resolve(rootDirectory, requestedPath);
	const relativePath = path.relative(rootDirectory, resolvedPath);
	if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
		throw new Error(
			'The requested path is outside the current working directory.',
		);
	}

	// Resolve the parent so a symlink cannot redirect a new file outside the workspace.
	const parent = await safePath(path.dirname(requestedPath));
	return path.join(parent, path.basename(resolvedPath));
}

async function walk(directory: string): Promise<string[]> {
	const entries = await fs.readdir(directory, {withFileTypes: true});
	const files: string[] = [];

	for (const entry of entries) {
		if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walk(entryPath)));
		} else if (entry.isFile()) {
			files.push(entryPath);
		}
	}

	return files;
}

const tools: Tool[] = [
	{
		name: 'list_directory',
		description:
			'list_directory(path?: string) - Lists files and directories at a path inside the current working directory.',
		requiresConfirmation: false,
		async execute(arguments_) {
			const requestedPath = stringArgument(arguments_, 'path', '.');
			const directory = await safePath(requestedPath);
			const entries = await fs.readdir(directory, {withFileTypes: true});
			return entries.map(
				entry => `${entry.isDirectory() ? 'directory' : 'file'}\t${entry.name}`,
			);
		},
	},
	{
		name: 'write_file',
		description:
			'write_file(path: string, content: string) - Creates or completely overwrites a UTF-8 file inside the current working directory.',
		requiresConfirmation: true,
		async execute(arguments_) {
			const filePath = await safeTargetPath(stringArgument(arguments_, 'path'));
			const content = textArgument(arguments_, 'content');
			await fs.writeFile(filePath, content, 'utf8');
			return `Wrote ${Buffer.byteLength(content, 'utf8')} bytes.`;
		},
	},
	{
		name: 'edit_file',
		description:
			'edit_file(path: string, old_text: string, new_text: string) - Replaces one unique exact text occurrence in a UTF-8 file.',
		requiresConfirmation: true,
		async execute(arguments_) {
			const filePath = await safePath(stringArgument(arguments_, 'path'));
			const oldText = stringArgument(arguments_, 'old_text');
			const newText = textArgument(arguments_, 'new_text');
			const content = await fs.readFile(filePath, 'utf8');
			const firstIndex = content.indexOf(oldText);
			if (firstIndex === -1)
				throw new Error('old_text was not found in the file.');
			if (content.indexOf(oldText, firstIndex + oldText.length) !== -1) {
				throw new Error('old_text is not unique in the file.');
			}

			await fs.writeFile(
				filePath,
				content.slice(0, firstIndex) +
					newText +
					content.slice(firstIndex + oldText.length),
				'utf8',
			);
			return 'File edited successfully.';
		},
	},
	{
		name: 'delete_file',
		description:
			'delete_file(path: string) - Deletes one file inside the current working directory. Requires user confirmation.',
		requiresConfirmation: true,
		async execute(arguments_) {
			const filePath = await safePath(stringArgument(arguments_, 'path'));
			const stats = await fs.stat(filePath);
			if (!stats.isFile()) throw new Error('The requested path is not a file.');
			await fs.unlink(filePath);
			return 'File deleted successfully.';
		},
	},
	{
		name: 'read_file',
		description:
			'read_file(path: string) - Reads a UTF-8 text file inside the current working directory (maximum 100 KiB).',
		requiresConfirmation: false,
		async execute(arguments_) {
			const filePath = await safePath(stringArgument(arguments_, 'path'));
			const stats = await fs.stat(filePath);
			if (!stats.isFile()) throw new Error('The requested path is not a file.');
			if (stats.size > 100 * 1024)
				throw new Error('The requested file is larger than 100 KiB.');
			return fs.readFile(filePath, 'utf8');
		},
	},
	{
		name: 'search_files',
		description:
			'search_files(query: string, path?: string) - Searches text files under a path and returns up to 50 matching lines.',
		requiresConfirmation: false,
		async execute(arguments_) {
			const query = stringArgument(arguments_, 'query');
			const directory = await safePath(stringArgument(arguments_, 'path', '.'));
			const files = await walk(directory);
			const matches: string[] = [];

			for (const filePath of files) {
				if (matches.length >= 50) break;

				const stats = await fs.stat(filePath);
				if (stats.size > 100 * 1024) continue;

				const content = await fs.readFile(filePath, 'utf8');
				for (const [index, line] of content.split('\n').entries()) {
					if (line.includes(query)) {
						matches.push(
							`${path.relative(rootDirectory, filePath)}:${index + 1}:${line}`,
						);
						if (matches.length >= 50) break;
					}
				}
			}

			return matches;
		},
	},
	{
		name: 'run_command',
		description:
			'run_command(command: string) - Runs a shell command in the current working directory. Requires user confirmation.',
		requiresConfirmation: true,
		async execute(arguments_) {
			const command = stringArgument(arguments_, 'command');
			const {stdout, stderr} = await exec(command, {
				cwd: rootDirectory,
				maxBuffer: 1024 * 1024,
			});
			return {stdout, stderr};
		},
	},
	{
		name: 'run_command_elevated',
		description:
			'run_command_elevated(command: string) - Runs a non-graphical shell command with administrator privileges using a native OS authorization dialog. Do not prefix the command with sudo. Always requires user confirmation.',
		requiresConfirmation: true,
		async execute(arguments_) {
			const command = stringArgument(arguments_, 'command');
			if (/^\s*sudo(?:\s|$)/.test(command)) {
				throw new Error(
					'Do not prefix elevated commands with sudo; pass the command itself.',
				);
			}

			return elevatedExec(command);
		},
	},
];

export function getToolDescriptions(): string[] {
	return tools.map(tool => tool.description);
}

function stripOuterNewline(value: string): string {
	let result = value;
	if (result.startsWith('\r\n')) result = result.slice(2);
	else if (result.startsWith('\n')) result = result.slice(1);

	if (result.endsWith('\r\n')) result = result.slice(0, -2);
	else if (result.endsWith('\n')) result = result.slice(0, -1);

	return result;
}

function parseParams(body: string): Record<string, unknown> {
	const arguments_: Record<string, unknown> = {};
	const paramPattern = /<param\s+name="([^"]+)">([\s\S]*?)<\/param>/g;
	let paramMatch: RegExpExecArray | null;

	while ((paramMatch = paramPattern.exec(body)) !== null) {
		const [, paramName, rawValue] = paramMatch;
		if (!paramName) continue;
		arguments_[paramName] = stripOuterNewline(rawValue ?? '');
	}

	return arguments_;
}

/**
 * Parses the first <tool_call> block found in the content, if any.
 * Kept for backwards compatibility with single-call call sites.
 */
export function parseToolCall(content: string): ToolCall | undefined {
	const calls = parseToolCalls(content);
	return calls[0];
}

/**
 * Parses every <tool_call> block found in the content, in the order they appear.
 * A response with no tool_call blocks returns an empty array.
 * A tool_call block with no <param> tags throws, since that indicates malformed model output.
 */
export function parseToolCalls(content: string): ToolCall[] {
	const calls: ToolCall[] = [];
	const callPattern =
		/<tool_call\s+name="([^"]+)">\s*([\s\S]*?)\s*<\/tool_call>/g;
	let callMatch: RegExpExecArray | null;

	while ((callMatch = callPattern.exec(content)) !== null) {
		const [, name, body] = callMatch;
		if (!name || body === undefined) continue;

		const arguments_ = parseParams(body);
		if (Object.keys(arguments_).length === 0) {
			throw new TypeError(
				`Invalid tool call "${name}". Expected at least one <param name="...">value</param> tag.`,
			);
		}

		calls.push({name, arguments: arguments_});
	}

	return calls;
}

function formatToolOutput(value: unknown): string {
	if (typeof value === 'string') return value;

	if (Array.isArray(value)) return value.join('\n');

	if (
		value &&
		typeof value === 'object' &&
		('stdout' in value || 'stderr' in value)
	) {
		const {stdout, stderr} = value as {stdout?: string; stderr?: string};
		const parts: string[] = [];
		if (stdout?.trim()) parts.push(stdout.trimEnd());
		if (stderr?.trim()) parts.push(`stderr:\n${stderr.trimEnd()}`);
		return parts.length > 0 ? parts.join('\n\n') : '(no output)';
	}

	return JSON.stringify(value, null, 2);
}

export async function executeTool(call: ToolCall): Promise<ToolResult> {
	const tool = tools.find(candidate => candidate.name === call.name);

	if (!tool) return {ok: false, tool_name: call.name, error: 'Unknown tool'};

	try {
		const result = await tool.execute(call.arguments);
		return {ok: true, tool_name: call.name, result: formatToolOutput(result)};
	} catch (error) {
		return {
			ok: false,
			tool_name: call.name,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Callback invoked before executing a tool call that requires confirmation.
 * Return true to proceed, false to decline (which cancels this call and
 * every call still queued after it in the same batch).
 */
export type ConfirmationHandler = (call: ToolCall) => Promise<boolean>;

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
	mode: 'plan' | 'normal' | 'yolo',
): Promise<ToolResult[]> {
	const results: ToolResult[] = [];
	let declined = false;

	for (const call of calls) {
		if (declined) {
			results.push({
				ok: false,
				tool_name: call.name,
				error: 'Skipped: a previous tool call in this batch was declined.',
			});
			continue;
		}

		if (toolRequiresConfirmation(call.name, mode)) {
			const confirmed = await onConfirm(call);
			if (!confirmed) {
				declined = true;
				results.push({
					ok: false,
					tool_name: call.name,
					error: 'User declined this action.',
				});
				continue;
			}
		}

		results.push(await executeTool(call));
	}

	return results;
}

export function toolRequiresConfirmation(
	name: string,
	mode: 'plan' | 'normal' | 'yolo',
): boolean {
	if (name === 'run_command_elevated') return true;
	if (mode === 'yolo') return false;

	return tools.find(tool => tool.name === name)?.requiresConfirmation ?? false;
}

function formatDiff(
	pathLabel: string,
	oldText: string,
	newText: string,
): string {
	const lines = [`--- a/${pathLabel}`, `+++ b/${pathLabel}`];
	if (oldText === newText) return [...lines, '  (no changes)'].join('\n');

	const oldLines = oldText.split('\n');
	const newLines = newText.split('\n');
	let start = 0;

	while (
		start < oldLines.length &&
		start < newLines.length &&
		oldLines[start] === newLines[start]
	) {
		start += 1;
	}

	let oldEnd = oldLines.length;
	let newEnd = newLines.length;
	while (
		oldEnd > start &&
		newEnd > start &&
		oldLines[oldEnd - 1] === newLines[newEnd - 1]
	) {
		oldEnd -= 1;
		newEnd -= 1;
	}

	const contextStart = Math.max(0, start - 2);
	const oldContextEnd = Math.min(oldLines.length, oldEnd + 2);
	const newContextEnd = Math.min(newLines.length, newEnd + 2);
	const oldHunkLength = oldContextEnd - contextStart;
	const newHunkLength = newContextEnd - contextStart;
	lines.push(
		`@@ -${contextStart + 1},${oldHunkLength} +${
			contextStart + 1
		},${newHunkLength} @@`,
	);

	if (contextStart > 0) lines.push('  …');

	for (let index = contextStart; index < start; index += 1) {
		lines.push(`  ${oldLines[index] ?? ''}`);
	}

	for (let index = start; index < oldEnd; index += 1) {
		lines.push(`- ${oldLines[index] ?? ''}`);
	}

	for (let index = start; index < newEnd; index += 1) {
		lines.push(`+ ${newLines[index] ?? ''}`);
	}

	for (let index = newEnd; index < newContextEnd; index += 1) {
		lines.push(`  ${newLines[index] ?? ''}`);
	}

	if (oldContextEnd < oldLines.length || newContextEnd < newLines.length) {
		lines.push('  …');
	}

	return lines.join('\n');
}

export async function describeToolConfirmation(
	call: ToolCall,
): Promise<ToolConfirmationDetails> {
	const requestedPath =
		typeof call.arguments['path'] === 'string' ? call.arguments['path'] : '.';

	switch (call.name) {
		case 'list_directory': {
			return {
				title: 'List directory?',
				description: `List entries in ${requestedPath}`,
			};
		}
		case 'read_file': {
			return {
				title: 'Read file?',
				description: `Read ${requestedPath}`,
			};
		}
		case 'write_file': {
			const content = textArgument(call.arguments, 'content');
			let previousContent = '';
			let action = 'Create';

			try {
				const filePath = await safePath(requestedPath);
				previousContent = await fs.readFile(filePath, 'utf8');
				action = 'Overwrite';
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
			}

			return {
				title: `${action} file?`,
				description: `${action} ${requestedPath}`,
				diff: formatDiff(requestedPath, previousContent, content),
			};
		}
		case 'edit_file': {
			const filePath = await safePath(requestedPath);
			const content = await fs.readFile(filePath, 'utf8');
			const oldText = stringArgument(call.arguments, 'old_text');
			const newText = textArgument(call.arguments, 'new_text');
			const firstIndex = content.indexOf(oldText);

			if (firstIndex === -1) {
				throw new Error('old_text was not found in the file.');
			}

			if (content.indexOf(oldText, firstIndex + oldText.length) !== -1) {
				throw new Error('old_text is not unique in the file.');
			}

			if (oldText === newText) {
				throw new Error('The proposed edit does not change the file.');
			}

			return {
				title: 'Edit file?',
				description: `Update ${requestedPath}`,
				diff: formatDiff(requestedPath, oldText, newText),
			};
		}
		case 'delete_file': {
			return {
				title: 'Delete file?',
				description: `${requestedPath} will be permanently deleted.`,
			};
		}
		case 'search_files': {
			const query = stringArgument(call.arguments, 'query');
			return {
				title: 'Search files?',
				description: `Search for "${query}" in ${requestedPath}`,
			};
		}
		case 'run_command': {
			const command = stringArgument(call.arguments, 'command');
			return {
				title: 'Run command?',
				description: command,
			};
		}
		case 'run_command_elevated': {
			const command = stringArgument(call.arguments, 'command');
			return {
				title: 'Run elevated command?',
				description: `${command}\n\nAn operating-system authorization dialog will open.`,
			};
		}
		default: {
			return {
				title: `Allow ${call.name}?`,
				description: `Run the unrecognized tool "${call.name}"`,
			};
		}
	}
}

export function describeToolActivity(call: ToolCall): string {
	const pathValue =
		typeof call.arguments['path'] === 'string' ? call.arguments['path'] : '.';
	const pathLabel = pathValue === '.' ? 'the current directory' : pathValue;

	switch (call.name) {
		case 'list_directory': {
			return `Listing ${pathLabel}...`;
		}
		case 'read_file': {
			return `Reading ${pathLabel}...`;
		}
		case 'write_file': {
			return `Writing to ${pathLabel}...`;
		}
		case 'edit_file': {
			return `Editing ${pathLabel}...`;
		}
		case 'delete_file': {
			return `Deleting ${pathLabel}...`;
		}
		case 'search_files': {
			const query =
				typeof call.arguments['query'] === 'string'
					? call.arguments['query']
					: '';
			return `Searching for "${query}" in ${pathLabel}...`;
		}
		case 'run_command': {
			const command =
				typeof call.arguments['command'] === 'string'
					? call.arguments['command']
					: '';
			return `Running command: ${command}`;
		}
		case 'run_command_elevated': {
			const command =
				typeof call.arguments['command'] === 'string'
					? call.arguments['command']
					: '';
			return `Running elevated command: ${command}`;
		}
		default: {
			return `Running ${call.name}...`;
		}
	}
}

/**
 * Replaces every <tool_call> block in the assistant's raw content with a short
 * one-line activity description, in order. Useful for rendering a live "doing X, then Y..."
 * status instead of showing the raw tags while a batch executes.
 */
export function formatToolActivityMessage(
	assistantContent: string,
	calls: ToolCall[],
): string {
	let index = 0;
	return assistantContent.replace(
		/<tool_call\s+name="[^"]+">[\s\S]*?<\/tool_call>/g,
		() => {
			const call = calls[index];
			index += 1;
			return call ? `⚙  ${describeToolActivity(call)}` : '';
		},
	);
}

/** Hides complete and partially streamed tool-call markup from user-facing text. */
export function hideStreamingToolCalls(content: string): string {
	const marker = '<tool_call';
	let visible = content.replace(
		/<tool_call\s+name="[^"]+">[\s\S]*?<\/tool_call>/g,
		'',
	);
	const incompleteCall = visible.indexOf(marker);
	if (incompleteCall !== -1) visible = visible.slice(0, incompleteCall);

	for (let length = marker.length - 1; length > 0; length -= 1) {
		if (visible.endsWith(marker.slice(0, length))) {
			return visible.slice(0, -length);
		}
	}

	return visible;
}
