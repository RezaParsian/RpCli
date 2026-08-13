export const ALWAYS_IGNORED_NAMES = new Set(['.git', 'dist', 'node_modules'])

export type IgnoreRule = {
	negated: boolean
	directoryOnly: boolean
	base: string
	regex: RegExp
}

function escapeRegex(value: string): string {
	return value.replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

function globToRegExp(pattern: string): string {
	let index = 0
	let result = ''

	while (index < pattern.length) {
		const character = pattern[index]

		if (character === '*') {
			if (pattern[index + 1] === '*') {
				if (pattern[index + 2] === '/') {
					result += '(?:.*/)?'
					index += 3
					continue
				}

				result += '.*'
				index += 2
				continue
			}

			result += '[^/]*'
			index += 1
			continue
		}

		if (character === '?') {
			result += '[^/]'
			index += 1
			continue
		}

		result += escapeRegex(character ?? '')
		index += 1
	}

	return result
}

export function parseGitignore(content: string, base = ''): IgnoreRule[] {
	const rules: IgnoreRule[] = []

	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.replace(/\\ /g, ' ').trimEnd()
		if (!line || line.startsWith('#')) continue

		let pattern = line
		let negated = false
		if (pattern.startsWith('!')) {
			negated = true
			pattern = pattern.slice(1)
		}

		let directoryOnly = false
		if (pattern.endsWith('/')) {
			directoryOnly = true
			pattern = pattern.slice(0, -1)
		}

		if (!pattern) continue

		const anchored = pattern.startsWith('/') || pattern.slice(0, -1).includes('/')
		if (pattern.startsWith('/')) pattern = pattern.slice(1)

		const body = globToRegExp(pattern)
		const regex = anchored ? new RegExp(`^${body}(?:/|$)`) : new RegExp(`(?:^|/)${body}(?:/|$)`)

		rules.push({
			negated,
			directoryOnly,
			base: base.replace(/\\/g, '/').replace(/\/$/, ''),
			regex,
		})
	}

	return rules
}

function pathRelativeToBase(relativePosix: string, base: string): string | undefined {
	if (!base) return relativePosix
	if (relativePosix === base) return ''
	if (relativePosix.startsWith(`${base}/`)) return relativePosix.slice(base.length + 1)
	return undefined
}

function ruleMatches(rule: IgnoreRule, relativePosix: string, isDirectory: boolean): boolean {
	if (rule.directoryOnly && !isDirectory) return false

	const relativeToBase = pathRelativeToBase(relativePosix, rule.base)
	if (relativeToBase === undefined || relativeToBase === '') return false

	return rule.regex.test(`${relativeToBase}/`) || rule.regex.test(relativeToBase)
}

export function isIgnored(relativePosix: string, isDirectory: boolean, rules: IgnoreRule[]): boolean {
	const parts = relativePosix.split('/').filter(Boolean)
	let ignored = false

	for (let index = 0; index < parts.length; index += 1) {
		const prefix = parts.slice(0, index + 1).join('/')
		const prefixIsDirectory = isDirectory || index < parts.length - 1

		for (const rule of rules) {
			if (ruleMatches(rule, prefix, prefixIsDirectory)) {
				ignored = !rule.negated
			}
		}
	}

	return ignored
}
