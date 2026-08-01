import {spawn} from 'node:child_process';
import {promises as fs} from 'node:fs';
import {createInterface} from 'node:readline/promises';
import path from 'node:path';
import {Writable} from 'node:stream';

const DEEPSEEK_URL = 'https://chat.deepseek.com/';
const TOKEN_EXPRESSION = `JSON.parse(localStorage.getItem('userToken')).value`;

function openDeepSeek(): void {
	const command =
		process.platform === 'darwin'
			? {file: 'open', arguments: [DEEPSEEK_URL]}
			: process.platform === 'win32'
			? {file: 'cmd', arguments: ['/c', 'start', '', DEEPSEEK_URL]}
			: {file: 'xdg-open', arguments: [DEEPSEEK_URL]};

	const child = spawn(command.file, command.arguments, {
		detached: true,
		stdio: 'ignore',
	});
	child.on('error', () => undefined);
	child.unref();
}

async function saveToken(
	environmentPath: string,
	token: string,
): Promise<void> {
	await fs.mkdir(path.dirname(environmentPath), {recursive: true});

	let content = '';
	try {
		content = await fs.readFile(environmentPath, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}

	const tokenLine = `DEEPSEEK_TOKEN=${JSON.stringify(token)}`;
	content = /^DEEPSEEK_TOKEN=.*$/m.test(content)
		? content.replace(/^DEEPSEEK_TOKEN=.*$/m, tokenLine)
		: `${content.trimEnd()}${content.trim() ? '\n' : ''}${tokenLine}\n`;

	await fs.writeFile(environmentPath, content, {encoding: 'utf8', mode: 0o600});
	await fs.chmod(environmentPath, 0o600);
}

async function readToken(): Promise<string> {
	let muted = false;
	const hiddenOutput = new Writable({
		write(chunk, encoding, callback) {
			if (!muted) process.stdout.write(chunk, encoding);
			callback();
		},
	});
	const readline = createInterface({
		input: process.stdin,
		output: hiddenOutput,
	});
	const answer = readline.question('Paste the returned token here: ');
	muted = true;
	const token = (await answer).trim();
	readline.close();
	process.stdout.write('\n');
	return token;
}

export default async function configureToken(
	environmentPath: string,
): Promise<string> {
	openDeepSeek();
	console.log(`
DeepSeek token is not configured.
1. Sign in at ${DEEPSEEK_URL} (it should open in your browser).
2. Open the browser developer console.
3. Paste this expression and press Enter:

   ${TOKEN_EXPRESSION}
`);

	const token = await readToken();

	if (!token) throw new Error('The DeepSeek token cannot be empty.');

	await saveToken(environmentPath, token);
	process.env['DEEPSEEK_TOKEN'] = token;
	console.log('Token saved. RP-CLI is now configured.\n');
	return token;
}
