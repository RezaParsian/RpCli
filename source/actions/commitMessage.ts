import { execSync } from 'child_process'
import { GitCommitMessage } from '../prompts/index.js'
import { deleteSession } from '../../core-lib/index.js'
import { getAIResponse } from './agent.js'

export function getGitDiff(useAll: boolean): string {
	const diffFlag = useAll ? 'HEAD' : '--staged'
	return execSync(`git -c core.safecrlf=false diff ${diffFlag}`, {
		encoding: 'utf8',
	})
}

export async function generateCommitMessage(diff: string, token: string): Promise<string> {
	await getAIResponse({ token, prompt: GitCommitMessage() })

	const response = await getAIResponse({ token, prompt: `Here is the git diff:\n\n${diff}` })

	await deleteSession(token, response.sessionId)

	return (response?.content || 'Ai Error!')?.trim()
}

export function executeCommit(message: string): void {
	execSync('git commit -F -', { input: message, encoding: 'utf8' })
}
