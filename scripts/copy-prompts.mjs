import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'source', 'prompts')
const destination = path.join(root, 'dist', 'source', 'prompts')

mkdirSync(destination, { recursive: true })

for (const entry of readdirSync(source)) {
	if (path.extname(entry) !== '.md') continue
	copyFileSync(path.join(source, entry), path.join(destination, entry))
}
