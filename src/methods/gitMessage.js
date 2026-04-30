import {execSync} from 'child_process';
import request from "../core/Ai.js";
import askYesNo from "../core/askYesNo.js";

export default async function handel() {
  const diff = getGitDiff();

  if (diff.trim() === '') {
    console.error('Error: No staged files found. Use `git add <file>` to stage changes first.');
    process.exit(1);
  }

  const messages = [
    {
      "role": "system",
      "content": "You are a helpful assistant that helps users generate Git commit messages from a Git diff. Your commit messages must be clear."
    },
    {
      "role": "system",
      "content": "don't generate extra data only git message in this format \n <type>: <short summary>\n \n <optional body explaining what & why>"
    },
    {
      "role": "assistant",
      "content": "Got it. Thanks for the context! I will extract the final commit message only"
    },
    {
      "role": "user",
      "content": diff
    }
  ];

  try {
    const res = await request(messages);
    const content = res.choices.reduce((res, choice) => {
      return res + choice.message.content;
    }, '');

    console.log('\x1b[35m' + content + '\x1b[0m');

    const [rl, shouldCommit] = await askYesNo('Do you want to commit this? (y/n)')

    if (shouldCommit) {
      console.log('\x1b[33mCommitting...\x1b[0m');

      execSync('git commit -F -', {input: content});

      console.log('\x1b[32mDone!\x1b[0m');
    }

    rl.close();
  } catch (error) {
    console.error('Error generating commit message:', error.message);
    process.exit(1);
  }
}

function getGitDiff() {
  let diff;

  try {
    diff = execSync('git diff --staged', {encoding: 'utf8'});
  } catch (err) {
    console.error('Error reading git diff:', err.message);
    process.exit(1);
  }

  return diff;
}