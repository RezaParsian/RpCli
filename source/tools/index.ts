import {promises as fs} from 'node:fs';
import path from 'node:path';
import {exec as execCallback} from 'node:child_process';
import {promisify} from 'node:util';

export type ToolCall = {
	name: string;
	arguments: Record<string, unknown>;
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

function stringArgument(
	arguments_: Record<string, unknown>,
	name: string,
	fallback?: string,
): string {
	const value = arguments_[name] ?? fallback;
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
				timeout: 60_000,
				maxBuffer: 1024 * 1024,
			});
			return {stdout, stderr};
		},
	},
];

export const TOOL_SYSTEM_PROMPT = `You have access to the tools below. When a tool is needed, respond using exactly this format and no Markdown code fence:

<tool_call>
{"name":"tool_name","arguments":{"parameter":"value"}}
</tool_call>

Available tools:
${tools.map((tool, index) => `${index + 1}. ${tool.description}`).join('\n')}

Use only one tool per response. Tool results will be sent back to you. If no tool is needed, answer directly without a <tool_call> tag.`;

export function parseToolCall(content: string): ToolCall | undefined {
	const match = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/.exec(content);
	if (!match?.[1]) return undefined;

	const parsed: unknown = JSON.parse(match[1]);
	if (
		typeof parsed !== 'object' ||
		parsed === null ||
		!('name' in parsed) ||
		typeof parsed.name !== 'string' ||
		!('arguments' in parsed) ||
		typeof parsed.arguments !== 'object' ||
		parsed.arguments === null ||
		Array.isArray(parsed.arguments)
	) {
		throw new TypeError(
			'Invalid tool call. Expected a name and an arguments object.',
		);
	}

	return {
		name: parsed.name,
		arguments: parsed.arguments as Record<string, unknown>,
	};
}

export async function executeTool(call: ToolCall): Promise<string> {
	const tool = tools.find(candidate => candidate.name === call.name);
	if (!tool)
		return JSON.stringify({ok: false, error: `Unknown tool: ${call.name}`});

	try {
		const result = await tool.execute(call.arguments);
		return JSON.stringify({ok: true, result});
	} catch (error) {
		return JSON.stringify({
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export function toolRequiresConfirmation(name: string): boolean {
	return tools.find(tool => tool.name === name)?.requiresConfirmation ?? false;
}

export function describeToolActivity(call: ToolCall): string {
	const pathValue =
		typeof call.arguments['path'] === 'string' ? call.arguments['path'] : '.';

	switch (call.name) {
		case 'list_directory': {
			return `Listing directory ${pathValue}...`;
		}
		case 'read_file': {
			return `Reading ${pathValue}...`;
		}
		case 'write_file': {
			return `Writing to ${pathValue}...`;
		}
		case 'edit_file': {
			return `Editing ${pathValue}...`;
		}
		case 'delete_file': {
			return `Deleting ${pathValue}...`;
		}
		case 'search_files': {
			const query =
				typeof call.arguments['query'] === 'string'
					? call.arguments['query']
					: '';
			return `Searching for "${query}" in ${pathValue}...`;
		}
		case 'run_command': {
			const command =
				typeof call.arguments['command'] === 'string'
					? call.arguments['command']
					: '';
			return `Running command: ${command}`;
		}
		default: {
			return `Running ${call.name}...`;
		}
	}
}
