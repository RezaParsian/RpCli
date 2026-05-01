import { execSync } from 'child_process';
import request from "../core/Ai.js";
import askYesNo from "../core/askYesNo.js";
import chalk from "chalk";
import ora from "ora";

export default async function generateCommitMessage(modelId, useAll = false) {
  const diffFlag = useAll ? 'HEAD' : '--staged';

  const diff = getGitDiff(diffFlag);

  if (!diff || diff.trim() === '') {
    console.error(chalk.red.bold(`\nError: No changes found in git diff ${diffFlag}.`));
    if (!useAll) {
      console.error(chalk.yellow('Tip: Stage your changes first using `git add .` or `git add <file>`'));
    }
    process.exit(1);
  }

  const messages = [
    {
      role: "system",
      content: `You are a senior engineer specialized in writing perfect Conventional Commit messages.

Instructions:
- Analyze the git diff carefully.
- Output **ONLY** the commit message. No explanations, no greetings, no extra text.
- Never use Markdown, code blocks, or any formatting.
- Use this format:

<type>(optional scope): short summary (max 72 characters)

Optional body explaining what and why the changes were made.

Allowed types: feat, fix, refactor, docs, style, test, chore, perf, ci, build, revert`
    },
    {
      role: "user",
      content: `Here is the git diff:\n\n${diff}`
    }
  ];

  try {
    console.log(chalk.cyan.bold('\n🤖 Generating commit message...\n'));

    const content = await request(modelId, messages);

    // Clean output
    const commitMessage = content.trim();

    console.log(chalk.bold.magenta('\n📝 Suggested Commit Message:'));
    console.log(chalk.white('─'.repeat(80)));
    console.log(chalk.cyan(commitMessage));
    console.log(chalk.white('─'.repeat(80)));

    // Ask user for confirmation
    const [rl, shouldCommit] = await askYesNo(
      chalk.blue('\nDo you want to commit with this message? ') + chalk.yellowBright('(y/n): ')
    );

    if (shouldCommit) {
      const commitSpinner = ora(chalk.yellow('Committing changes...')).start();

      try {
        execSync('git commit -F -', { input: commitMessage, encoding: 'utf8' });
        commitSpinner.succeed(chalk.green.bold('Successfully committed!'));
      } catch (commitError) {
        commitSpinner.fail(chalk.red.bold('Commit failed'));
        console.error(chalk.red(commitError.message));
      }
    } else {
      console.log(chalk.yellow('\nCommit cancelled by user.'));
    }

    rl.close();
  } catch (error) {
    console.error(chalk.red.bold('\n✖ Error:'), error.message);
    process.exit(1);
  }
}

// Helper function
function getGitDiff(diffFlag) {
  try {
    return execSync(`git -c core.safecrlf=false diff ${diffFlag}`, {
      encoding: 'utf8'
    });
  } catch (err) {
    console.error(chalk.red('Error reading git diff:'), err.message);
    process.exit(1);
  }
}