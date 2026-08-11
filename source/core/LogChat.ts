import { tokenConfigDirectory } from './TokenConfig.js'
import path from 'node:path'
import * as fs from 'node:fs'

export default function LogChat(logData: { [key: string]: any; sessionId: string }) {
	const logDir = path.join(tokenConfigDirectory, 'logs')

	if (!fs.existsSync(logDir)) {
		fs.mkdirSync(logDir, { recursive: true })
	}

	if (!fs.existsSync(path.join(logDir, logData.sessionId))) {
		fs.mkdirSync(path.join(logDir, logData.sessionId))
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
	const logFile = path.join(logDir, logData.sessionId, `chat_${timestamp}.json`)

	fs.writeFileSync(logFile, JSON.stringify(logData, null, 2))
}
