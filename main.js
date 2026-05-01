#!/usr/bin/env node

import {program} from 'commander';
import models from "./src/config/models.js";
import chalk from "chalk";

program
  .name('rp-cli')
  .description('CLI tool that uses AI to generate Git commit messages')
  .argument('[prompt...]', 'Optional prompt')
  .option('-m, --models', 'Show available models')
  .option('-c, --commit-message', 'Generate commit message from git diff --staged')
  .option('-a, --commit-all', 'Use git diff HEAD instead of --staged (must be used with -c/--commit-message)')
  .option('--model <number>', `Choose model (1 to ${models.length})`)
  .version('0.1.0')
  .addHelpText('after', `
Examples:
  $ rp-cli "explain bubble search in 2 sentences"
  $ rp-cli -c
  $ rp-cli -c -a 
  $ rp-cli -ca
  $ rp-cli --commit-message --commit-all
  $ rp-cli --models
  `);

program.action(async (promptArray, options) => {
  const prompt = promptArray.join(' ').trim();
  const modelId = options.model ? parseInt(options.model) - 1 : 4;
  const selectedModel = models[modelId];

  if (options.models) {
    showModelsList();
    return;
  }

  if (options.commitMessage) {
    await handleCommitMessage(selectedModel, options.commitAll);
    return;
  }

  if (!prompt) {
    console.log(chalk.yellow('\nNo prompt provided.\n'));
    program.help();
    return;
  }

  await handleNormalChat(selectedModel, prompt);
});


function showModelsList() {
  console.log(chalk.cyan.bold('\n🧠 Available Models:\n'));
  models.forEach((m, i) => {
    console.log(
      chalk.white(`${i + 1}. ${chalk.bold(m.name)}`) +
      chalk.gray(`  (${m.provider})`) +
      (m.is_default ? chalk.green(' ✔ Default') : '')
    );
  });
  console.log('');
}

async function handleCommitMessage(selectedModel, useAll = false) {
  const diffType = useAll ? 'HEAD' : '--staged';

  console.log(chalk.cyan.bold('\n🚀 RP-CLI AI Assistant'));
  console.log(chalk.gray(`Model : ${selectedModel.name}`));
  console.log(chalk.gray(`Mode  : Generating commit message from git diff ${diffType}\n`));

  const commitModule = await import('./src/methods/commitMessage.js');
  await commitModule.default(selectedModel.id, useAll);
}

async function handleNormalChat(selectedModel, prompt) {
  console.log(chalk.cyan.bold('\n🚀 RP-CLI AI Assistant'));
  console.log(chalk.gray(`Model : ${selectedModel.name}`));
  console.log(chalk.gray(`Prompt: "${prompt}"\n`));

  const chatModule = await import('./src/methods/chat.js');
  await chatModule.default(selectedModel.id, prompt);
}

program.parse();