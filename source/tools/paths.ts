import { promises as fs } from 'node:fs'
import path from 'node:path'

export const rootDirectory = process.cwd()

export async function safePath(requestedPath: string): Promise<string> {
	const resolvedPath = path.resolve(rootDirectory, requestedPath)
	const relativePath = path.relative(rootDirectory, resolvedPath)
	if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
		throw new Error('The requested path is outside the current working directory.')
	}

	const realPath = await fs.realpath(resolvedPath)
	const realRoot = await fs.realpath(rootDirectory)
	const realRelativePath = path.relative(realRoot, realPath)
	if (realRelativePath.startsWith('..') || path.isAbsolute(realRelativePath)) {
		throw new Error('The requested path resolves outside the current working directory.')
	}

	return realPath
}

export async function safeTargetPath(requestedPath: string): Promise<string> {
	const resolvedPath = path.resolve(rootDirectory, requestedPath)
	const relativePath = path.relative(rootDirectory, resolvedPath)
	if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
		throw new Error('The requested path is outside the current working directory.')
	}

	// Resolve the parent so a symlink cannot redirect a new file outside the workspace.
	const parent = await safePath(path.dirname(requestedPath))
	return path.join(parent, path.basename(resolvedPath))
}
