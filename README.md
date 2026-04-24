# RpCLI

![reza](result.jpg)

A command-line interface tool that leverages AI to help with Git commit message generation.

## Features

- Generate clear Git commit messages from staged changes using AI
- Multiple AI model support (GPT-4o Mini, DeepSeek V3.2, Qwen3 Coder Next, and more)
- Simple CLI interface

## Installation

### Via npm registry

```bash
npm install -g rp-cli
# or
pnpm install -g rp-cli
# or
bun install -g rp-cli
```

### Via source (without npm package)

```bash
git clone https://github.com/RezaParsian/rp-cli.git
cd rp-cli
npm install -g .
# or
pnpm install -g .
# or
bun install -g .
```

## Usage

```bash
# Generate a commit message from staged changes
rp-cli

# Show available AI models
rp-cli --models

# Use a specific model (1-6)
rp-cli --model 1

# Show version
rp-cli --version
```

## Configuration

The default AI model is DeepSeek V3.2. You can change it using the `--model` flag or by setting the `DEFAULT_AI_MODEL` environment variable.

## License

MIT © [RezaParsian](https://github.com/RezaParsian)