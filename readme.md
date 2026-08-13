# RpCli

AI-powered coding CLI (`rc`) — interactive chat with local tools, plan and yolo modes, single prompts, and git commit messages.

## Install

```bash
npm install --global @rezaparsian/rp-cli
```

On first run, RP-CLI asks for a DeepSeek token and stores it in `~/.config/rp-cli/.env`.

## Usage

```
rc                            Open interactive chat
rc "your question"            Send a single prompt without thinking
rc -t "your question"         Enable and display thinking
rc -tq "your question"        Enable thinking but display only the final answer
rc -s "your question"         Enable web search
rc -st "your question"        Enable web search and thinking
rc -c                         Generate a commit message from staged changes
rc -c -a                      Generate a commit message from all changes (HEAD)
```

### Options

| Option                   | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| `-t`, `--thinking`       | Enable thinking for a single prompt.                   |
| `-q`, `--quiet`          | Hide thinking output. Combine with `-t` as `-tq`.      |
| `-s`, `--search`         | Enable web search for a single prompt.                 |
| `-c`, `--commit-message` | Generate a commit message from staged changes.         |
| `-a`, `--commit-all`     | Use all changes from `HEAD` instead of staged changes. |

To save only the final answer while allowing the model to think:

```bash
rc -tq "write documentation for this project" > documentation.md
```

## Interactive chat

`rc` with no arguments opens a persistent TUI. Ctrl+C clears non-empty input first; press it again on an empty input to exit. Esc stops an in-progress generation.

The system prompt is sent as soon as interactive mode opens. If the program closes before you send a message, the unused chat session is deleted automatically.

Type `@` to mention a file or folder from the workspace. Type `/` to pick a slash command.

### Execution modes

Press **TAB** to cycle `normal` → `yolo` → `plan`. The status bar shows the current mode.

| Mode     | Behavior                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------- |
| `normal` | Mutating tools (`write_file`, `edit_file`, `delete_file`, `run_command`) ask for **y/n** first.   |
| `yolo`   | Mutating tools run without confirmation, except elevated/`sudo` commands, which always ask.       |
| `plan`   | Read-only. The model may inspect the repo, then you get **Start this plan?** **y** leaves plan, restores the previous mode, and executes. **n** stays in plan. |

### Slash commands

| Command              | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `/init`              | Generate or update `AGENTS.md` for this repository.      |
| `/continue`          | Keep going after the 10-round tool limit.                |
| `/clear`             | Start a new conversation.                                |
| `/help`              | List commands.                                           |
| `/search`            | Toggle web search.                                       |
| `/thinking`          | Toggle thinking (on by default in chat).                 |
| `/logging` (`/log`)  | Toggle saving transcripts under `~/.config/rp-cli/logs`. |
| `/exit` (`/quit`)    | Close the application.                                   |

Thinking and final responses are shown as separate messages. Web search and chat logging are off by default.

The input supports forward Delete, Ctrl+Backspace and Ctrl+Delete for word deletion, and Ctrl+Left/Right for word navigation. Alt+Backspace and Alt+Delete are disabled. Ctrl+J inserts a newline.

## Single prompt

`rc "..."` sends one question, renders the response as formatted markdown, then exits. Thinking is disabled by default. Use `-t` to enable and display it, or `-tq` to enable it silently and render only the final answer. Web search is also disabled by default and can be enabled with `-s`. Boolean short flags can be combined:

```bash
rc -st "find the latest Node.js release and explain the changes"
rc -stq "research this topic and save only the final answer" > answer.md
```

Thinking and final answers stream to the terminal as they are generated. Raw tool call markup is hidden during streaming and replaced by a concise activity message.

## Commit message

`rc -c` reads your staged git diff, generates a Conventional Commit message, shows it, and asks for confirmation before committing. `-a` uses `git diff HEAD` instead of staged changes.

## AI tools

RP-CLI tells the model about local tools and executes tool calls returned by the model:

- `list_directory(path?)` lists a directory.
- `read_file(path)` reads a UTF-8 file up to 100 KiB.
- `write_file(path, content)` creates or overwrites a file.
- `edit_file(path, old_text, new_text)` performs a unique exact replacement.
- `delete_file(path)` deletes a file after user confirmation.
- `search_files(query, path?)` searches files and returns up to 50 matching lines.
- `run_command(command)` runs a shell command. Include `sudo` anywhere in the command to open an OS authorization dialog (UAC on Windows).

When the user asks for a file, the model is instructed to write it with `write_file` rather than paste the contents into the chat.

For each tool call, RP-CLI keeps the assistant's explanatory text in the chat and replaces the raw `<tool_call>` markup with a human-readable activity message. The assistant can chain tool calls; after 10 rounds it stops and you can type `/continue`.

All paths are restricted to the directory where RP-CLI was started. To add another tool, register it in `source/tools/registry.ts`; the system prompt is generated from the same registry. Tool calls use this protocol:

```xml
<tool_call name="read_file">
  <param name="path">package.json</param>
</tool_call>
```

Write literal `<` and `>` inside parameter values. Do not convert them to `&lt;` or `&gt;`. The only sequences that must not appear unescaped in a value are `</param>` and `</tool_call>`.
