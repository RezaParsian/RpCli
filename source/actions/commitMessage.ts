import {execSync} from 'child_process';
import request from '../core/Ai.js';
import type {ChatCompletionMessageParam} from 'openai/resources/chat/completions';

export function getGitDiff(useAll: boolean): string {
	const diffFlag = useAll ? 'HEAD' : '--staged';
	return execSync(`git -c core.safecrlf=false diff ${diffFlag}`, {
		encoding: 'utf8',
	});
}

export async function generateCommitMessage(
	modelId: string,
	diff: string,
): Promise<string> {
	const messages: ChatCompletionMessageParam[] = [
		{
			role: 'system',
			content: `You are a senior engineer specialized in writing perfect Conventional Commit messages.

Instructions:
- Analyze the git diff carefully.
- Output **ONLY** the commit message. No explanations, no greetings, no extra text.
- Never use Markdown, code blocks, or any formatting.
- Use this format:

<type>(optional scope): short summary (max 72 characters)

Optional body explaining what and why the changes were made.

Allowed types: feat, fix, refactor, docs, style, test, chore, perf, ci, build, revert`,
		},
		{
			role: 'user',
			content: `Here is the git diff:\n\n${diff}`,
		},
	];

	const content = await request(modelId, messages);
	return content.trim();
}

export function executeCommit(message: string): void {
	execSync('git commit -F -', {input: message, encoding: 'utf8'});
}
