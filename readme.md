# RpCli

AI-powered CLI tool for developers — chat with AI, generate git commit messages, and more.

## Install

```bash
npm install --global @rezaparsian/rp-cli
```

## Usage

```
rc                            Open interactive chat mode
rc "your question"            Send a single prompt without thinking
rc -t "your question"         Enable and display thinking
rc -tq "your question"        Enable thinking but display only the final answer
rc -c                         Generate a commit message from staged changes
rc -c -a                      Generate a commit message from all changes (HEAD)
```

### Options

| Option | Description |
| --- | --- |
| `-t`, `--thinking` | Enable thinking for a single prompt. |
| `-q`, `--quiet` | Hide thinking output. Combine with `-t` as `-tq`. |
| `-c`, `--commit-message` | Generate a commit message from staged changes. |
| `-a`, `--commit-all` | Use all changes from `HEAD` instead of staged changes. |

To save only the final answer while allowing the model to think:

```bash
rc -tq "write documentation for this project" > documentation.md
```

## Modes

**Interactive chat** (`rc` with no arguments)
Opens a persistent TUI with the logo, message history, and a text input. Stays open until Ctrl+C.
The system prompt is sent as soon as interactive mode opens. If the program closes
before the user sends a message, the unused chat session is deleted automatically.
Initialization happens silently without replacing the input with a loading indicator.
Thinking is enabled by default. The status bar shows whether it is on or off; use
the `/thinking` command to toggle it. Thinking and final responses are displayed
as separate messages.

**Single prompt** (`rc "..."`)
Sends one question, renders the response as formatted markdown, then exits.
Thinking is disabled by default. Use `-t` to enable and display it, or `-tq` to
enable it silently and render only the final answer.

**Commit message** (`rc -c`)
Reads your staged git diff, generates a Conventional Commit message, shows it, and asks for confirmation before committing.

## AI tools

RP-CLI tells the model about local tools and automatically executes
tool calls returned by the model:

- `list_directory(path?)` lists a directory.
- `read_file(path)` reads a UTF-8 file up to 100 KiB.
- `write_file(path, content)` creates or overwrites a file.
- `edit_file(path, old_text, new_text)` performs a unique exact replacement.
- `delete_file(path)` deletes a file after user confirmation.
- `search_files(query, path?)` searches files and returns up to 50 matching lines.
- `run_command(command)` runs a shell command after user confirmation.

For each tool call, RP-CLI keeps the assistant's explanatory text in the chat and
replaces the raw `<tool_call>` JSON with a human-readable activity message. These
messages remain in the conversation history instead of disappearing after execution.
The assistant can chain as many tool calls as the task requires.

All paths are restricted to the directory where RP-CLI was started. To add another
tool, register its description and executor in `source/tools/index.ts`; the system
prompt is generated from the same registry. Tool calls use this protocol:

```xml
<tool_call>
{"name":"read_file","arguments":{"path":"package.json"}}
</tool_call>
```
