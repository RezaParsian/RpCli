import React from 'react';
import {Box, Text} from 'ink';
import {marked} from 'marked';
import SyntaxHighlight from 'ink-syntax-highlight';

type AnyToken = {
	type: string;
	raw?: string;
	text?: string;
	depth?: number;
	tokens?: AnyToken[];
	href?: string;
	items?: AnyToken[];
	lang?: string;
};

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

		if (token.type === 'text' && token.tokens && token.tokens.length > 0) {
			return (
				<React.Fragment key={i}>{renderInline(token.tokens)}</React.Fragment>
			);
		}

		return <Text key={i}>{token.text ?? token.raw ?? ''}</Text>;
	});
}

function renderBlock(token: AnyToken, key: number): React.ReactNode {
	if (token.type === 'heading') {
		const colorMap: Record<number, string> = {
			1: 'magenta',
			2: 'cyan',
			3: 'white',
		};
		const color = colorMap[token.depth ?? 1] ?? 'white';
		return (
			<Box key={key} marginTop={key > 0 ? 1 : 0}>
				<Text bold color={color}>
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
					language={token.lang}
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
							{inlineTokens.length > 0 ? renderInline(inlineTokens) : item.text}
						</Text>
					);
				})}
			</Box>
		);
	}

	if (token.type === 'hr') {
		return (
			<Text key={key} color="gray">
				{'─'.repeat(60)}
			</Text>
		);
	}

	if (token.type === 'space') {
		return <Box key={key} marginBottom={1}/>;
	}

	return <Text key={key}>{token.raw ?? ''}</Text>;
}

export default function MarkdownText({text}: { text: string }) {
	const tokens = marked.lexer(text) as unknown as AnyToken[];

	return (
		<Box flexDirection="column">
			{tokens.map((token, i) => renderBlock(token, i))}
		</Box>
	);
}
