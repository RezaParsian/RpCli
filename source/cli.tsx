#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import dotenv from 'dotenv';
import sendMessage from "./core/SendMessage.js";

dotenv.config({quiet: true})

const { default: App } = await import('./app.js');

const cli = meow(
	`
	Usage
	  $ rp-cli                           Open interactive chat
	  $ rp-cli <prompt>                  Send a single prompt
	  $ rp-cli -c / --commit-message     Generate commit message from staged changes
	  $ rp-cli -c -a                     Use git diff HEAD instead of --staged
	  $ rp-cli --models                  Show available models

	Options
	  --commit-message, -c  Generate commit message from staged changes
	  --commit-all, -a      Use git diff HEAD instead of --staged (use with -c)
	  --version             Show version

	Examples
	  $ rp-cli
	  $ rp-cli "explain bubble sort in 2 sentences"
	  $ rp-cli -c
	  $ rp-cli -c -a
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

const selectedModel = 'DeepSeek';
const prompt = cli.input.join(' ').trim();

const token = process.env["DEEPSEEK_TOKEN"];

sendMessage(token!,'im reza')

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
		commitAll={cli.flags.commitAll ?? false}
		prompt={prompt}
		version={cli.pkg.version}
	/>,
);
