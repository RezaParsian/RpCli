import {execSync} from 'child_process';
import {getAIResponse} from './chat.js';
import deleteSession from '../core/DeleteSession.js';

const token = process.env['DEEPSEEK_TOKEN']!;

const CHAT_SYSTEM_PROMPT = `You are a senior engineer specialized in writing perfect Conventional Commit messages.

Instructions:
- Analyze the git diff carefully.
- Output **ONLY** the commit message. No explanations, no greetings, no extra text.
- Never use Markdown, code blocks, or any formatting.
- Use this format:

<type>(optional scope): short summary (max 72 characters)

Optional body explaining what and why the changes were made.

Allowed types: feat, fix, refactor, docs, style, test, chore, perf, ci, build, revert`;

export function getGitDiff(useAll: boolean): string {
	const diffFlag = useAll ? 'HEAD' : '--staged';
	return execSync(`git -c core.safecrlf=false diff ${diffFlag}`, {
		encoding: 'utf8',
	});
}

export async function generateCommitMessage(diff: string): Promise<string> {
	await getAIResponse(token, CHAT_SYSTEM_PROMPT);

	const response = await getAIResponse(
		token,
		`Here is the git diff:\n\n${diff}`,
	);

	await deleteSession(token, response.sessionId);

	return (response?.content || 'Ai Error!')?.trim();
}

export function executeCommit(message: string): void {
	execSync('git commit -F -', {input: message, encoding: 'utf8'});
}
