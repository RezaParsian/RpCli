#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import models from './config/models.js';
import App from './app.js';

const cli = meow(
	`
	Usage
	  $ rp-cli                           Open interactive chat
	  $ rp-cli <prompt>                  Send a single prompt
	  $ rp-cli -c / --commit-message     Generate commit message from staged changes
	  $ rp-cli -c -a                     Use git diff HEAD instead of --staged
	  $ rp-cli --models                  Show available models

	Options
	  --models, -m          Show available models
	  --commit-message, -c  Generate commit message from staged changes
	  --commit-all, -a      Use git diff HEAD instead of --staged (use with -c)
	  --model               Choose model number (1 to ${models.length})
	  --version             Show version

	Examples
	  $ rp-cli
	  $ rp-cli "explain bubble sort in 2 sentences"
	  $ rp-cli -c
	  $ rp-cli -c -a
	  $ rp-cli --models
	  $ rp-cli --model 3 -c
`,
	{
		importMeta: import.meta,
		flags: {
			models: {type: 'boolean', shortFlag: 'm'},
			commitMessage: {type: 'boolean', shortFlag: 'c'},
			commitAll: {type: 'boolean', shortFlag: 'a'},
			model: {type: 'number'},
		},
	},
);

const modelIndex = cli.flags.model ? cli.flags.model - 1 : 4;
const selectedModel = models[modelIndex] ?? models[4]!;
const prompt = cli.input.join(' ').trim();

const mode = cli.flags.models
	? 'models'
	: cli.flags.commitMessage
		? 'commit'
		: prompt
			? 'prompt'
			: 'interactive';

render(
	<App
		mode={mode}
		selectedModel={selectedModel}
		allModels={models}
		commitAll={cli.flags.commitAll ?? false}
		prompt={prompt}
		version={cli.pkg.version}
	/>,
);
