# RpCli

AI-powered coding CLI (`rc`) — interactive chat with local tools, plan/yolo modes, single prompts, and git commit messages.

## Features

- 🤖 **Interactive chat** – natural language coding assistant with tool access
- 🔧 **Built-in tools** – file read/write/edit/delete, shell commands, search
- 📎 **File references** – attach local file contents with `@path` before sending a request
- 💬 **Session resume** – reopen a conversation with `rc resume <session-id>`
- 🧠 **Plan mode** – read-only exploration before implementing changes
- ⚡ **YOLO mode** – execute ordinary tools without confirmation; elevated commands still require approval
- 📝 **Commit message generation** – generate conventional commit messages from staged or all changes
- 🌐 **HTTP server** – serve an OpenAI-compatible API with `rc serve`

## Install

```bash
npm install --global @rezaparsian/rp-cli
# or
pnpm add -g @rezaparsian/rp-cli
```

On first run, RP-CLI asks for a DeepSeek token and stores it in `~/.config/rp-cli/.env`.

RP-CLI checks npm for a newer version on each run and immediately prints an update
notice inside the Ink interface with `npm install --global @rezaparsian/rp-cli@latest` when one is available.
The check times out after three seconds if npm is unreachable. Checks are skipped for
`rc serve`, `--help`, and `--version`. Set `NO_UPDATE_NOTIFIER=1` to disable them.

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
rc serve                      Start an OpenAI-compatible HTTP API
rc serve --port 8080          Listen on a custom port
rc resume <session-id>        Resume a previous conversation
```

### Options

| Option                   | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| `-t`, `--thinking`       | Enable thinking for a single prompt.                   |
| `-q`, `--quiet`          | Hide thinking output. Combine with `-t` as `-tq`.      |
| `-s`, `--search`         | Enable web search for a single prompt.                 |
| `-c`, `--commit-message` | Generate a commit message from staged changes.         |
| `-a`, `--commit-all`     | Use all changes from `HEAD` instead of staged changes. |
| `-p`, `--port`           | Port for `rc serve` (default: `3000`).                 |
| `--host`                 | Bind address for `rc serve` (default: `127.0.0.1`).    |

To save only the final answer while allowing the model to think:

```bash
rc -tq "write documentation for this project" > documentation.md
```

## OpenAI-compatible API

`rc serve` exposes a local OpenAI Chat Completions API in front of DeepSeek. Point any OpenAI SDK or client at it.

```
rc serve
rc serve --port 8080 --host 127.0.0.1
```

| Endpoint                               | Description                             |
| -------------------------------------- | --------------------------------------- |
| `POST /v1/chat/completions`            | Continue the current conversation.      |
| `POST /v1/chat/completions/:sessionId` | Continue a specific DeepSeek session.   |
| `GET /v1/models`                       | List the advertised model (`deepseek`). |
| `GET /v1/models/deepseek`              | Get the advertised model details.       |
| `GET /health`                          | Liveness check.                         |

Models: `deepseek-chat` (default) and `deepseek-reasoner` (thinking / `reasoning_content`). Requests use the token from `~/.config/rp-cli/.env`, or `Authorization: Bearer <token>` if no config token is set.

```bash
curl http://127.0.0.1:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"Hello"}]}'
```

```python
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:3000/v1", api_key="not-needed")
print(client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "Hello"}],
).choices[0].message.content)
```

The server keeps a persistent conversation and sends only the final item in each `messages` array. Use the `:sessionId` endpoint to select an existing DeepSeek conversation. `stream: true` returns SSE chunks ending with `data: [DONE]`. Successful completion responses include the active session in the `X-RP-Session-Id` header. Extra fields `thinking_enabled` and `search_enabled` are accepted.

The OpenAI-compatible `reasoning_effort` field is also accepted. `none` and `minimal` disable DeepSeek thinking; `low`, `medium`, `high`, `xhigh`, and `max` enable it. DeepSeek exposes thinking as a boolean, so enabled effort levels do not produce different reasoning depths. When both fields are present, `thinking_enabled` takes precedence.

Client-defined function tools are supported through the OpenAI `tools` and `tool_choice` fields. RP-CLI returns `finish_reason: "tool_calls"` and does not execute these functions. Execute the requested function in the client, then send its result as the final message with `role: "tool"` and the matching `tool_call_id`. Tool definitions are cached per session, so clients may omit unchanged `tools` on later requests.

## Interactive Chat

`rc` with no arguments opens a persistent TUI. Ctrl+C clears non-empty input first; press it again on an empty input to exit. Esc stops an in-progress generation.

The system prompt is sent as soon as interactive mode opens. If the program closes before you send a message, the unused chat session is deleted automatically.

Type `@` to mention a file or folder from the workspace. Type `/` to pick a slash command.

Use Ctrl+Home to scroll to the top, Ctrl+End to scroll to the bottom. PageUp and PageDown scroll by pages.

### Execution modes

Press **TAB** to cycle `normal` → `yolo` → `plan` in interactive chat. The status bar shows the current mode.

| Mode     | Behavior                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normal` | Mutating tools (`write_file`, `edit_file`, `delete_file`, `run_command`) ask for **y/n** first.                                                                |
| `yolo`   | Mutating tools run without confirmation, except elevated/`sudo` commands, which always ask.                                                                    |
| `plan`   | Read-only. The model may inspect the repo, then you get **Start this plan?** **y** leaves plan, restores the previous mode, and executes. **n** stays in plan. |

### Slash commands

| Command             | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `/init`             | Generate or update `AGENTS.md` for this repository.      |
| `/continue`         | Keep going after the 10-round tool limit.                |
| `/clear`            | Start a new conversation.                                |
| `/help`             | List commands.                                           |
| `/search`           | Toggle web search.                                       |
| `/thinking`         | Toggle thinking (on by default in chat).                 |
| `/logging` (`/log`) | Toggle saving transcripts under `~/.config/rp-cli/logs`. |
| `/exit` (`/quit`)   | Close the application.                                   |

The CLI uses the default DeepSeek model. Thinking and final responses stream separately; `/thinking` toggles thinking without switching models. Web search and chat logging are off by default.

The input supports forward Delete, Ctrl+Backspace and Ctrl+Delete for word deletion, and Ctrl+Left/Right for word navigation. Alt+Backspace and Alt+Delete are disabled. Ctrl+J inserts a newline.

### File references

Mention a file with `@path/to/file` (or `@"path with spaces.txt"`). Its UTF-8
contents are read locally and attached to the same user request, in both interactive
chat and single-prompt mode, without waiting for a model-issued `read_file` call.
Repeated references within a message are attached once. Files must
be inside the working directory and no larger than 100 KiB. Directory references
attach their immediate entries. Unreadable references report an error before the
user request is sent.

```bash
rc "Explain @source/cli.tsx"
rc 'Review @"docs/design notes.md"'
```

## Single prompt

`rc "..."` sends one question, renders the response as formatted Markdown, then exits. Thinking is disabled by default. Use `-t` to enable and display it, or `-tq` to enable it silently and render only the final answer. Web search is also disabled by default and can be enabled with `-s`. Boolean short flags can be combined:

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
- `read_file(path, offset?, limit?)` reads a UTF-8 file up to 100 KiB, optionally selecting a 1-based line range.
- `write_file(path, content)` creates or overwrites a file.
- `edit_file(path, old_text, new_text)` performs a unique exact replacement.
- `delete_file(path)` deletes a file after user confirmation.
- `search_files(query, path?)` searches files and returns up to 50 matching lines.
- `run_command(command)` runs a shell command. Include `sudo` anywhere in the command to open an OS authorization dialog (UAC on Windows).

When the user asks for a file, the model is instructed to write it with `write_file` rather than paste the contents into the chat.

For each tool call, RP-CLI keeps the assistant's explanatory text in the chat and replaces the raw `tool_call` blocks with a human-readable activity message. The assistant can chain tool calls; after 10 rounds it stops and you can type `/continue`.

File tools and `@` references are restricted to the directory where RP-CLI was started.
Shell commands start in that directory. The prompt includes the detected operating
system (Windows, Linux, or macOS), execution shell, and working directory.

To add a tool, register it in `source/tools/registry.ts`; the tool list in the prompt
is generated from that registry. Local tool calls use a Markdown fence with a tool
name and a JSON input object:

````text
```tool_call
name: read_file
input: {"path":"package.json"}
```
````

Use valid JSON, with double-quoted keys and strings. Encode newlines as `\n`,
quotes as `\"`, and backslashes as `\\`. Use `{}` for an empty input object.
The application executes the call and sends a `tool_result` block containing JSON
with `tool_name`, `ok`, and `result` or `error`. These local tool blocks are separate
from client-defined function tools in the HTTP API.

## Configuration

The CLI stores configuration in `~/.config/rp-cli/`:

- `.env` – DeepSeek token (`DEEPSEEK_TOKEN`) and logging preference (`RP_CLI_LOG_CHAT`)
- `sessions/` – saved interactive transcripts used by `rc resume <session-id>`
- `logs/` – request prompts, stream events, and parsed results when logging is enabled

## Troubleshooting

If DeepSeek reports that the server is busy, wait briefly and send the message again.
A failed session initialization can be retried on the next send. Use `/logging` to
capture request and response details when investigating a problem.

## Development

```bash
# Clone the repository
git clone https://github.com/RezaParsian/RpCli.git
cd RpCli

# Install dependencies
pnpm install

# Build
pnpm build

# Development watch mode
pnpm dev

# Run tests
pnpm test

# Format code
pnpm format
```

## License

MIT
