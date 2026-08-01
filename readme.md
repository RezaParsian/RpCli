# RpCli

AI-powered CLI tool for developers — chat with AI, generate git commit messages, and more.

## Install

```bash
npm install --global @rezaparsian/rp-cli
```

## Usage

```
rp-cli                        Open interactive chat mode
rp-cli "your question"        Send a single prompt and get a response
rp-cli -c                     Generate a commit message from staged changes
rp-cli -c -a                  Generate a commit message from all changes (HEAD)
```

On the first run, if no DeepSeek token is configured, RP-CLI opens the DeepSeek
website and guides you through retrieving the token from the browser console. The
token is stored in `~/.config/rp-cli/.env` for future runs.

## Modes

**Interactive chat** (`rp-cli` with no arguments)
Opens a persistent TUI with the logo, message history, and a text input. Stays open until Ctrl+C.
The system prompt is sent as soon as interactive mode opens. If the program closes
before the user sends a message, the unused chat session is deleted automatically.
Initialization happens silently without replacing the input with a loading indicator.

**Single prompt** (`rp-cli "..."`)
Sends one question, renders the response as formatted markdown, then exits.

**Commit message** (`rp-cli -c`)
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
