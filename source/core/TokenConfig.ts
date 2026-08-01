import {mkdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const tokenConfigDirectory = path.join(
	os.homedir(),
	'.config',
	'rp-cli',
);
export const tokenConfigPath = path.join(tokenConfigDirectory, '.env');

export async function saveDeepSeekToken(token: string): Promise<void> {
	await mkdir(tokenConfigDirectory, {recursive: true, mode: 0o700});
	await writeFile(
		tokenConfigPath,
		`DEEPSEEK_TOKEN=${JSON.stringify(token)}\n`,
		{
			mode: 0o600,
		},
	);
}

export async function clearDeepSeekToken(): Promise<void> {
	await rm(tokenConfigPath, {force: true});
}
