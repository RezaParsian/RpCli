import OpenAI from 'openai';
import ora from "ora";
import chalk from "chalk";

const openai = new OpenAI({
  baseURL: 'https://gateway.hashpa.com/api/v0',
  apiKey: 'rsk-gLdm2gmnRStRCIFJi54JEDjmI2IPYagJvRZ8hDFiqCcP05rEIIUdLbhLYf0nsj3',
});

export default async function request(model_id, messages) {
  const spinner = ora({
    text: chalk.yellow('Thinking...'),
    color: 'yellow',
    spinner: 'clock'
  }).start();

  const completion = await openai.chat.completions.create({
    model_id,
    messages,
    temperature: 0.1,
  });

  spinner.succeed('Generated Successfully!\n');

  return completion.choices.reduce((res, choice) => {
    return res + choice.message.content;
  }, '')
}