#!/usr/bin/env node

import {program} from 'commander';
import models from "./src/config/models.js";
import handel from "./src/methods/gitMessage.js"

process.env.DEFAULT_AI_MODEL = 'e9cd4b4c-c3e7-4e2f-ab89-6468963f3dfb'

program
  // .option('--git-message', 'this command with read you git diff --staged and generate a clear git commit message')
  .option('--model <model>', `use specific model <model> (chose between 1 to ${models.length})`)
  .option('--models', 'show available models to use')
  .option('--version', 'show application version')

 program.parse();

const options = program.opts();


Object.keys(options).forEach(async (key) => {
  const module = await import(`./src/methods/${key}.js`);
  module.default(options[key])
})

handel()