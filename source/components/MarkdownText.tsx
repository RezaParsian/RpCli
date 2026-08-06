import React from 'react';
import {Box, Text} from 'ink';
import {marked} from 'marked';
import SyntaxHighlight from 'ink-syntax-highlight';

type TableCell = {
	text?: string;
	tokens?: AnyToken[];
};

type TableRow = TableCell[];

type AnyToken = {
	type: string;
	raw?: string;
	text?: string;
	depth?: number;
	tokens?: AnyToken[];
	href?: string;
	items?: AnyToken[];
	lang?: string;

	// Tables
	header?: TableCell[];
	rows?: TableRow[];
};

const supportedLanguages = new Set([
	'bash',
	'c',
	'cpp',
	'csharp',
	'css',
	'diff',
	'go',
	'ini',
	'java',
	'javascript',
	'json',
	'kotlin',
	'less',
	'lua',
	'makefile',
	'markdown',
	'objectivec',
	'perl',
	'php',
	'php-template',
	'plaintext',
	'python',
	'python-repl',
	'r',
	'ruby',
	'rust',
	'scss',
	'shell',
	'sql',
	'swift',
	'typescript',
	'vbnet',
	'wasm',
	'xml',
	'yaml',
]);

const languageAliases: Record<string, string> = {
	csv: 'plaintext',
	html: 'xml',
	js: 'javascript',
	md: 'markdown',
	sh: 'shell',
	text: 'plaintext',
	ts: 'typescript',
	txt: 'plaintext',
};

function syntaxLanguage(language?: string): string | undefined {
	if (!language) return undefined;

	const normalized = language.trim().split(/\s+/, 1)[0]!.toLowerCase();
	const resolved = languageAliases[normalized] ?? normalized;

	return supportedLanguages.has(resolved) ? resolved : 'plaintext';
}

function renderInline(tokens: AnyToken[]): React.ReactNode {
	return tokens.map((token, i) => {
		if (token.type === 'strong') {
			return (
				<Text key={i} bold>
					{token.tokens ? renderInline(token.tokens) : token.text}
				</Text>
			);
		}

		if (token.type === 'em') {
			return (
				<Text key={i} italic>
					{token.tokens ? renderInline(token.tokens) : token.text}
				</Text>
			);
		}

		if (token.type === 'codespan') {
			return (
				<Text key={i} color="yellow">
					{token.text}
				</Text>
			);
		}

		if (token.type === 'link') {
			return (
				<Text key={i}>
					<Text color="cyan">{token.text}</Text>
					<Text color="gray"> ({token.href})</Text>
				</Text>
			);
		}

		if (token.type === 'text' && token.tokens?.length) {
			return (
				<React.Fragment key={i}>
					{renderInline(token.tokens)}
				</React.Fragment>
			);
		}

		return <Text key={i}>{token.text ?? token.raw ?? ''}</Text>;
	});
}

function inlineText(tokens?: AnyToken[]): string {
	if (!tokens) return '';

	return tokens
		.map(token => {
			if (token.tokens) {
				return inlineText(token.tokens);
			}

			return token.text ?? token.raw ?? '';
		})
		.join('');
}

function renderBlock(
	token: AnyToken,
	key: number,
	isThinking = false
): React.ReactNode {
	if (token.type === 'heading') {
		const colorMap: Record<number, string> = {
			1: 'magenta',
			2: 'cyan',
			3: 'white',
		};

		return (
			<Box key={key} marginTop={key > 0 ? 1 : 0}>
				<Text
					bold
					color={
						isThinking
							? undefined
							: (colorMap[token.depth ?? 1] ?? 'white')
					}
				>
					{token.tokens ? renderInline(token.tokens) : token.text}
				</Text>
			</Box>
		);
	}

	if (token.type === 'paragraph') {
		return (
			<Box key={key} marginBottom={1}>
				<Text wrap="wrap">
					{token.tokens ? renderInline(token.tokens) : token.text}
				</Text>
			</Box>
		);
	}

	if (token.type === 'code') {
		return (
			<Box key={key} flexDirection="column" marginY={1}>
				<SyntaxHighlight
					code={token.text || ''}
					language={syntaxLanguage(token.lang)}
				/>
			</Box>
		);
	}

	if (token.type === 'list') {
		return (
			<Box key={key} flexDirection="column" marginBottom={1}>
				{token.items?.map((item, i) => {
					const inlineTokens =
						(item.tokens?.[0] as AnyToken | undefined)?.tokens ?? [];

					return (
						<Text key={i}>
							{'  • '}
							{inlineTokens.length
								? renderInline(inlineTokens)
								: item.text}
						</Text>
					);
				})}
			</Box>
		);
	}

	if (token.type === 'table') {
		const headers = (token.header ?? []).map(cell =>
			cell.tokens ? inlineText(cell.tokens) : (cell.text ?? '')
		);

		const rows = (token.rows ?? []).map(row =>
			row.map(cell =>
				cell.tokens ? inlineText(cell.tokens) : (cell.text ?? '')
			)
		);

		const allRows = [headers, ...rows];

		const widths = headers.map((_, col) =>
			Math.max(...allRows.map(row => (row[col] ?? '').length))
		);

		const border = (
			left: string,
			middle: string,
			right: string
		) =>
			left +
			widths.map(w => '─'.repeat(w + 2)).join(middle) +
			right;

		const formatRow = (cells: string[]) =>
			'│ ' +
			cells
				.map((cell, i) => cell.padEnd(widths[i] ?? 0))
				.join(' │ ') +
			' │';

		return (
			<Box key={key} flexDirection="column" marginBottom={1}>
				<Text>{border('┌', '┬', '┐')}</Text>

				<Text
					bold
					color={isThinking ? undefined : 'cyan'}
				>
					{formatRow(headers)}
				</Text>

				<Text>{border('├', '┼', '┤')}</Text>

				{rows.map((row, i) => (
					<Text key={i}>{formatRow(row)}</Text>
				))}

				<Text>{border('└', '┴', '┘')}</Text>
			</Box>
		);
	}

	if (token.type === 'hr') {
		return (
			<Text key={key} color={isThinking ? undefined : 'gray'}>
				{'─'.repeat(60)}
			</Text>
		);
	}

	if (token.type === 'space') {
		return <Box key={key} marginBottom={1}/>;
	}

	return <Text key={key}>{token.raw ?? ''}</Text>;
}

type markdownTextProps = { text: string; isThinking?: boolean; }
export default function MarkdownText({text, isThinking = false}: markdownTextProps) {
	const tokens = marked.lexer(text) as unknown as AnyToken[];

	return (
		<Box flexDirection="column">
			{tokens.map((token, i) => renderBlock(token, i, isThinking))}
		</Box>
	);
}
