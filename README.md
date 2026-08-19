# RpCli

AI-powered coding CLI (`rc`) — interactive chat with local tools, plan/yolo modes, single prompts, and git commit messages.

## Features

- 🤖 **Interactive chat** – natural language coding assistant with tool access
- 🔧 **Built-in tools** – file read/write/edit, shell commands, search, todos
- 📋 **Todo management** – track progress with `todo_add`, `todo_split`, `todo_update`, `todo_list`, `todo_clear` *(see note under Interactive Chat)*
- 🧠 **Plan mode** – read-only exploration before implementing changes
- 🔄 **Model switching** – switch between default and Expert models while carrying conversation context into a fresh session
- ⚡ **YOLO mode** – execute tools without confirmation
- 📝 **Commit message generation** – generate conventional commit messages from staged or all changes
- 🌐 **HTTP server** – serve an OpenAI-compatible API with `rc serve`

## Install

```bash
npm install --global @rezaparsian/rp-cli
# or
pnpm add -g @rezaparsian/rp-cli
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
rc serve                      Start an OpenAI-compatible HTTP API
rc serve --port 8080          Listen on a custom port
rc --plan "your question"     Plan mode (read-only) for a single prompt
```

### Options

| Option                   | Description                                            |
|--------------------------|--------------------------------------------------------|
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

| Endpoint                               | Description                           |
|----------------------------------------|---------------------------------------|
| `POST /v1/chat/completions`            | Continue the current conversation.    |
| `POST /v1/chat/completions/:sessionId` | Continue a specific DeepSeek session. |
| `GET /health`                          | Liveness check.                       |

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

### Execution modes

Press **TAB** to cycle `normal` → `yolo` → `plan`. The status bar shows the current mode. (Some workflows also switch modes via the `/plan`, `/normal`, and `/yolo` slash commands below.)

| Mode     | Behavior                                                                                                                                                       |
|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `normal` | Mutating tools (`write_file`, `edit_file`, `delete_file`, `run_command`) ask for **y/n** first.                                                                |
| `yolo`   | Mutating tools run without confirmation, except elevated/`sudo` commands, which always ask.                                                                    |
| `plan`   | Read-only. The model may inspect the repo, then you get **Start this plan?** **y** leaves plan, restores the previous mode, and executes. **n** stays in plan. |

### Slash commands

| Command             | Description                                              |
|---------------------|----------------------------------------------------------|
| `/init`             | Generate or update `AGENTS.md` for this repository.      |
| `/continue`         | Keep going after the 10-round tool limit.                |
| `/clear`            | Start a new conversation (clears todos too).             |
| `/help`             | List commands.                                           |
| `/search`           | Toggle web search.                                       |
| `/model`            | Switch between the default and Expert models. The current conversation is summarized and carried into the new session. |
| `/thinking`         | Toggle thinking (on by default in chat).                 |
| `/logging` (`/log`) | Toggle saving transcripts under `~/.config/rp-cli/logs`. |
| `/todos`            | Show current todo list.                                  |
| `/plan`             | Switch to plan mode.                                     |
| `/normal`           | Switch to normal mode.                                   |
| `/yolo`             | Switch to YOLO mode.                                     |
| `/exit` (`/quit`)   | Close the application.                                   |

Thinking and final responses are shown as separate messages. Web search and chat logging are off by default.

The input supports forward Delete, Ctrl+Backspace and Ctrl+Delete for word deletion, and Ctrl+Left/Right for word navigation. Alt+Backspace and Alt+Delete are disabled. Ctrl+J inserts a newline.

### Todo tools

For multistep tasks, the agent can track progress with a built-in todo system:

1. **Create a main task** with `todo_add`
2. **Split it into subtasks** with `todo_split` (subtasks provided as a list, one per line)
3. **Mark progress** with `todo_update` as each subtask completes
4. **Show the full list** after every operation, or on demand with `/todos`

**Example workflow:**

```
User: "Build a REST API with Express and TypeScript"

Agent: *Creates todo #1 with 8 subtasks*
Agent: *Works through each subtask, updating status as it goes*
Agent: *Shows progress after each step*
```

> Note: this todo system is documented in one version of the project's README but not the other — confirm it's still present before relying on it.

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

## Configuration

The CLI stores configuration in `~/.config/rp-cli/`:

- `.env` – API keys and preferences (including logging and model selection)

The selected model is stored as `RP_CLI_MODEL=default` or `RP_CLI_MODEL=expert`.
- `logs/` – chat transcripts (if logging is enabled)

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
