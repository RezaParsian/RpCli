#!/usr/bin/env node
import meow from 'meow'
import dotenv from 'dotenv'
import { tokenConfigPath } from './core/TokenConfig.js'

dotenv.config({
	path: tokenConfigPath,
	quiet: true,
})

const cli = meow(
	`
	Usage
	  $ rc                           Open interactive chat
	  $ rc <prompt>                  Send a single prompt
	  $ rc -t <prompt>               Send a prompt with thinking enabled
	  $ rc -tq <prompt>              Think silently and show only the answer
	  $ rc -s <prompt>               Enable web search for a prompt
	  $ rc -c / --commit-message     Generate commit message from staged changes
	  $ rc -c -a                     Use git diff HEAD instead of --staged
	$ rc serve                     Start an OpenAI-compatible HTTP API
	  $ rc serve --port 8080         Start server on custom port
	  $ rc serve --host 127.0.0.1    Bind to specific host

	Options
	  --commit-message, -c  Generate commit message from staged changes
	  --commit-all, -a      Use git diff HEAD instead of --staged (use with -c)
	  --thinking, -t        Enable thinking for a single prompt
	  --quiet, -q           Hide thinking output from a single prompt
	  --search, -s          Enable web search for a single prompt
	  --port, -p            Port to listen on (default: 3000)
	  --host                Host to bind to (default: 0.0.0.0)
	  --version             Show version

	Examples
	  $ rc
	  $ rc "explain bubble sort in 2 sentences"
	  $ rc -t "solve this step by step"
	  $ rc -tq "say 1"
	  $ rc -c
	  $ rc -c -a
	  $ rc serve
	  $ rc serve --port 8080
`,
	{
		importMeta: import.meta,
		flags: {
			commitMessage: { type: 'boolean', shortFlag: 'c' },
			commitAll: { type: 'boolean', shortFlag: 'a' },
			thinking: { type: 'boolean', shortFlag: 't' },
			quiet: { type: 'boolean', shortFlag: 'q' },
			search: { type: 'boolean', shortFlag: 's' },
			port: { type: 'string', shortFlag: 'p' },
			host: { type: 'string' },
		},
	}
)

const firstArg = cli.input[0]

if (firstArg === 'serve') {
	// Start HTTP server
	const { startServer } = await import('./server/index.js')
	const port = cli.flags.port ? parseInt(cli.flags.port, 10) : undefined
	const host = cli.flags.host
	await startServer({ port, host })
} else {
	// Interactive or prompt mode
	const { render } = await import('ink')
	const { default: App } = await import('./app.js')
	const React = await import('react')

	const prompt = cli.input.join(' ').trim()
	const mode = cli.flags.commitMessage ? 'commit' : prompt ? 'prompt' : 'interactive'

	render(
		React.createElement(App, {
			mode,
			commitAll: cli.flags.commitAll ?? false,
			prompt,
			thinking: cli.flags.thinking ?? false,
			quiet: cli.flags.quiet ?? false,
			search: cli.flags.search ?? false,
			version: cli.pkg.version,
		}),
		{
			exitOnCtrlC: false,
			kittyKeyboard: { mode: 'enabled' },
		}
	)
}
