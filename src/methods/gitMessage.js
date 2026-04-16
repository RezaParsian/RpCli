import {execSync} from 'child_process';
import request from "../core/Ai.js";

export default async function handel() {
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
      "content": getGitDiff(),
    }
  ];

  try {
    const res = await request(messages)
    const content = res.choices.reduce((res, choice) => {
      return res + choice.message.content;
    }, '')

    console.log(content)
  } catch (error) {
    console.error(error)
  }
}

function getGitDiff() {
  let diff;

  try {
    diff = execSync('git diff --staged', {encoding: 'utf8'});
  } catch (err) {
    console.error('خطا:', err.message);
    process.exit(1);
  }

  return diff;
}