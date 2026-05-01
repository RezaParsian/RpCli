# Rp-cli

![view](https://drive.usercontent.google.com/download?id=1n-Y-Spc_Etp_ogyN6u8tOGomLwLyWBzv&export=view)

A command-line interface tool that uses AI to generate Git commit messages and answer prompts.

## Prerequisites

- Node.js >=18.0.0
- Git installed and configured

## Features

- Generate commit messages from staged changes using AI
- Multiple AI model support (GPT‑4o Mini, DeepSeek V3.2, Qwen3 Coder Next, etc.)
- Interactive chat mode for general prompts
- Simple CLI with Commander.js

## Installation

### Via npm registry

```bash
npm install -g @rezaparsian/rp-cli
# or
pnpm install -g @rezaparsian/rp-cli
# or
bun install -g @rezaparsian/rp-cli
```

### Via source (without npm package)

```bash
git clone https://github.com/RezaParsian/RpCli.git
cd RpCli
npm install -g .
# or
pnpm install -g .
# or
bun install -g .
```

## Usage

```bash
# Ask a general question
rp-cli "explain bubble search in 2 sentences"

# Generate a commit message from staged changes
rp-cli -c
# or
rp-cli --commit-message

# Generate a commit message from all changes (HEAD)
rp-cli -c -a
# or
rp-cli --commit-message --commit-all

# Show available AI models
rp-cli --models

# Use a specific model (1‑6)
rp-cli --model 1

# Show version
rp-cli --version
```

### Available Models

| # | Model Name       | Provider   | Default |
|---|------------------|------------|---------|
| 1 | GPT 4o mini      | OpenAI     |         |
| 2 | Step 3.5 Flash   | OpenRouter |         |
| 3 | Gemma 4 31b it   | OpenRouter |         |
| 4 | GPT OSS 120b     | OpenRouter |         |
| 5 | DeepSeek V3.2    | OpenRouter | ✔       |
| 6 | Qwen3 Coder Next | OpenRouter |         |

## License

MIT © [RezaParsian](https://github.com/RezaParsian)