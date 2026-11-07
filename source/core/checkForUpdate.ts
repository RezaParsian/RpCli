import semver from 'semver'

export async function checkForUpdate(name: string, currentVersion: string): Promise<string | undefined> {
	try {
		const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
			signal: AbortSignal.timeout(3000),
		})
		if (!response.ok) return undefined

		const data: unknown = await response.json()
		if (!data || typeof data !== 'object' || !('version' in data) || typeof data.version !== 'string') return undefined
		if (!semver.valid(data.version) || !semver.valid(currentVersion) || !semver.gt(data.version, currentVersion)) {
			return undefined
		}

		return `Update available: ${currentVersion} → ${data.version}\nRun npm install --global ${name}@latest to update.\n`
	} catch {
		// Offline or unavailable registry: continue starting the CLI.
		return undefined
	}
}
