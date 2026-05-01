import {marked} from 'marked';
import chalk from 'chalk';

export default function renderMarkdown(text) {
  // Configure marked to output simple text + basic formatting
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  let html = marked.parse(text);

  // Convert common Markdown to terminal-friendly format
  let output = html
    // Headers
    .replace(/<h1>(.*?)<\/h1>/gi, (_, p1) => chalk.bold.magenta('\n' + p1 + '\n'))
    .replace(/<h2>(.*?)<\/h2>/gi, (_, p1) => chalk.bold.cyan('\n' + p1))
    .replace(/<h3>(.*?)<\/h3>/gi, (_, p1) => chalk.bold.white('\n' + p1))

    // Bold & Italic
    .replace(/<strong>(.*?)<\/strong>/gi, (_, p1) => chalk.bold(p1))
    .replace(/<em>(.*?)<\/em>/gi, (_, p1) => chalk.italic(p1))

    // Lists
    .replace(/<li>(.*?)<\/li>/gi, (_, p1) => `  • ${p1}`)
    .replace(/<\/?ul>/gi, '\n')
    .replace(/<\/?ol>/gi, '\n')

    // Code blocks & inline code
    .replace(/<pre><code>(.*?)<\/code><\/pre>/gis, (_, p1) =>
      chalk.gray('\n' + '─'.repeat(60) + '\n') +
      chalk.white(p1.trim()) +
      chalk.gray('\n' + '─'.repeat(60))
    )
    .replace(/<code>(.*?)<\/code>/gi, (_, p1) => chalk.yellow(p1))

    // Links
    .replace(/<a href="(.*?)">(.*?)<\/a>/gi, (_, url, text) =>
      chalk.cyan(text) + chalk.gray(` (${url})`)
    )
    .replace(/&#39;/gi, '\'')
    // Clean up remaining HTML tags
    .replace(/<\/?[^>]+(>|$)/g, "");

  return output.trim();
}