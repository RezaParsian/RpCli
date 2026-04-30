#!/usr/bin/env node

import {program} from 'commander';
import models from "./src/config/models.js";
import handel from "./src/methods/gitMessage.js"

process.env.DEFAULT_AI_MODEL = 'e9cd4b4c-c3e7-4e2f-ab89-6468963f3dfb'

program
  .version('0.0.1')
  .description('CLI tool that uses AI to generate Git commit messages')
  .option('--model <model>', `use specific model <model> (choose between 1 to ${models.length})`)
  .option('--models', 'show available models to use')
  .addHelpText('after', '\nExample:\n  rp-cli\n  rp-cli --model 1\n  rp-cli --models')

program.parse();

const options = program.opts();

if (options.help || program.opts().version) {
  program.outputHelp();
  process.exit(0);
}

Object.keys(options).forEach(async (key) => {
  if (key !== 'help' && key !== 'version') {
    try {
      const module = await import(`./src/methods/${key}.js`);
      await module.default(options[key])
    } catch (error) {
      console.error(`Error running ${key}:`, error.message);
      process.exit(1);
    }
  }
})

if (!Object.keys(options).some(k => k !== 'help' && k !== 'version' && k !== 'model')) {
  try {
    await handel()
  } catch (error) {
    console.error('Error generating commit message:', error.message);
    process.exit(1);
  }
}