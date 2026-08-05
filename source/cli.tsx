#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import dotenv from 'dotenv';
import {tokenConfigPath} from './core/TokenConfig.js';

dotenv.config({
	path: tokenConfigPath,
	quiet: true,
});

const {default: App} = await import('./app.js');

const cli = meow(
	`
	Usage
	  $ rc                           Open interactive chat
	  $ rc <prompt>                  Send a single prompt
	  $ rc -t <prompt>               Send a prompt with thinking enabled
	  $ rc -tq <prompt>              Think silently and show only the answer
	  $ rc -c / --commit-message     Generate commit message from staged changes
	  $ rc -c -a                     Use git diff HEAD instead of --staged

	Options
	  --commit-message, -c  Generate commit message from staged changes
	  --commit-all, -a      Use git diff HEAD instead of --staged (use with -c)
	  --thinking, -t        Enable thinking for a single prompt
	  --quiet, -q           Hide thinking output from a single prompt
	  --version             Show version

	Examples
	  $ rc
	  $ rc "explain bubble sort in 2 sentences"
	  $ rc -t "solve this step by step"
	  $ rc -tq "say 1"
	  $ rc -c
	  $ rc -c -a
`,
	{
		importMeta: import.meta,
		flags: {
			commitMessage: {type: 'boolean', shortFlag: 'c'},
			commitAll: {type: 'boolean', shortFlag: 'a'},
			thinking: {type: 'boolean', shortFlag: 't'},
			quiet: {type: 'boolean', shortFlag: 'q'},
		},
	},
);

const prompt = cli.input.join(' ').trim();

const mode = cli.flags.commitMessage
	? 'commit'
	: prompt
		? 'prompt'
		: 'interactive';

render(
	<App
		mode={mode}
		commitAll={cli.flags.commitAll ?? false}
		prompt={prompt}
		thinking={cli.flags.thinking ?? false}
		quiet={cli.flags.quiet ?? false}
		version={cli.pkg.version}
	/>,
	{kittyKeyboard: {mode: 'enabled'}},
);
