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
rp-cli --models               List available AI models
rp-cli --model <n> -c         Use a specific model (1–6)
```

## Modes

**Interactive chat** (`rp-cli` with no arguments)
Opens a persistent TUI with the logo, message history, and a text input. Stays open until Ctrl+C.

**Single prompt** (`rp-cli "..."`)
Sends one question, renders the response as formatted markdown, then exits.

**Commit message** (`rp-cli -c`)
Reads your staged git diff, generates a Conventional Commit message, shows it, and asks for confirmation before committing.

**Models list** (`rp-cli --models`)
Prints all available models with their provider and default indicator.

## Models

| # | Name | Provider | Default |
|---|------|----------|---------|
| 1 | GPT 4o mini | OpenAI | |
| 2 | Step 3.5 Flash | OpenRouter | |
| 3 | Gemma 4 31b it | OpenRouter | |
| 4 | GPT OSS 120b | OpenRouter | |
| 5 | DeepSeek V3.2 | OpenRouter | ✔ |
| 6 | Qwen3 Coder Next | OpenRouter | |
