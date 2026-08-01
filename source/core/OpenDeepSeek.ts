import {spawn} from 'node:child_process';

export const DEEPSEEK_URL = 'https://chat.deepseek.com/';
export const DEEPSEEK_TOKEN_COMMAND =
	"JSON.parse(localStorage.getItem('userToken')).value";

export default function openDeepSeek(): void {
	const command =
		process.platform === 'win32'
			? 'cmd'
			: process.platform === 'darwin'
				? 'open'
				: 'xdg-open';
	const arguments_ =
		process.platform === 'win32'
			? ['/c', 'start', '', DEEPSEEK_URL]
			: [DEEPSEEK_URL];

	const child = spawn(command, arguments_, {
		detached: true,
		stdio: 'ignore',
	});
	child.on('error', () => undefined);
	child.unref();
}
