import {promises as fs} from 'node:fs';
import path from 'node:path';

export type ToolCall = {
	name: string;
	arguments: Record<string, unknown>;
};

type Tool = {
	name: string;
	description: string;
	execute: (arguments_: Record<string, unknown>) => Promise<unknown>;
};

const rootDirectory = process.cwd();
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules']);

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
		name: 'list_files',
		description:
			'list_files(path?: string) - Lists files and directories at a path inside the current working directory.',
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
