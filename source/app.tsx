import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import CommitView from './components/CommitView.js'
import SinglePromptView from './components/SinglePromptView.js'
import InteractiveChatView from './components/InteractiveChatView.js'
import TokenSetupView from './components/TokenSetupView.js'
import { clearDeepSeekToken } from './core/TokenConfig.js'

type Mode = 'interactive' | 'prompt' | 'commit'

type Props = {
	mode: Mode
	commitAll: boolean
	prompt: string
	resumeSessionId?: string
	thinking: boolean
	quiet: boolean
	search: boolean
	version?: string
}

function Header() {
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text bold color="cyan">
				🚀 RP-CLI AI Assistant
			</Text>
		</Box>
	)
}

export default function App({ mode, commitAll, prompt, resumeSessionId, thinking, quiet, search, version }: Props) {
	const { exit } = useApp()
	const exiting = useRef(false)
	const beforeExit = useRef<(() => Promise<void>) | undefined>(undefined)
	const [token, setToken] = useState(process.env['DEEPSEEK_TOKEN'])
	const quit = useCallback(
		(code = 0) => {
			if (exiting.current) return
			exiting.current = true
			void (async () => {
				await beforeExit.current?.().catch(() => undefined)
				exit()
				setTimeout(() => {
					process.exit(code)
				}, 50)
			})()
		},
		[exit]
	)
	const registerBeforeExit = useCallback((cleanup?: () => Promise<void>) => {
		beforeExit.current = cleanup
	}, [])

	useInput(
		(input, key) => {
			if ((key.ctrl && input.toLowerCase() === 'c') || input === '\u0003') {
				quit(130)
			}
		},
		{ isActive: mode !== 'interactive' || !token }
	)

	useEffect(() => {
		const handleInterrupt = () => quit(130)
		process.on('SIGINT', handleInterrupt)
		return () => {
			process.off('SIGINT', handleInterrupt)
		}
	}, [quit])

	const handleInvalidToken = useCallback(() => {
		delete process.env['DEEPSEEK_TOKEN']
		setToken(undefined)
		void clearDeepSeekToken()
	}, [])

	if (!token) {
		return (
			<Box flexDirection="column" marginX={1} marginY={1}>
				<Header />
				<TokenSetupView onTokenSaved={setToken} />
			</Box>
		)
	}

	if (mode === 'commit') {
		return (
			<Box flexDirection="column" marginX={1} marginY={1}>
				<Header />
				<CommitView useAll={commitAll} token={token} onInvalidToken={handleInvalidToken} />
			</Box>
		)
	}

	if (mode === 'prompt') {
		return (
			<Box flexDirection="column" marginX={1} marginY={1}>
				<Header />
				<SinglePromptView
					prompt={prompt}
					thinking={thinking}
					quiet={quiet}
					search={search}
					token={token}
					onInvalidToken={handleInvalidToken}
				/>
			</Box>
		)
	}

	return (
		<InteractiveChatView
			version={version}
			token={token}
			resumeSessionId={resumeSessionId}
			onInvalidToken={handleInvalidToken}
			onExit={quit}
			onRegisterBeforeExit={registerBeforeExit}
		/>
	)
}
