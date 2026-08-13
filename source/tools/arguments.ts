export function stringArgument(arguments_: Record<string, unknown>, name: string, fallback?: string): string {
	const value = arguments_[name] !== '' ? arguments_[name] : fallback
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(`Argument "${name}" must be a non-empty string.`)
	}

	return value
}

export function textArgument(arguments_: Record<string, unknown>, name: string): string {
	const value = arguments_[name]
	if (typeof value !== 'string') {
		throw new TypeError(`Argument "${name}" must be a string.`)
	}

	return value
}
