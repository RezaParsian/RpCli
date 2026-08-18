# AGENTS.md – RpCli

This file provides operational guidance for AI coding agents working on this repository. It is the ground truth for build/test commands, code conventions, and architecture boundaries.

## Quick Commands

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install dependencies |
| `pnpm build` | Compile TypeScript and copy prompt files to `dist/` |
| `pnpm dev` | Watch mode: copy prompts and run `tsc --watch` |
| `pnpm test` | Run `prettier --check .`, `xo`, and `ava` |
| `pnpm format` | Run `prettier --write .` |

## Stack

- **Runtime:** Node.js ≥18 (ES modules, `"type": "module"`)
- **Package manager:** pnpm (workspace: pnpm-workspace.yaml)
- **Language:** TypeScript (extends `@sindresorhus/tsconfig`)
- **UI:** React 19 + Ink 7 (TUI components)
- **Linting/Formatting:** XO (with `xo-react`), Prettier
- **Testing:** AVA (with ts-node loader)
- **AI API:** DeepSeek (chat and reasoning models)
- **HTTP server:** Express

## Code Style

- Prettier config (from `package.json`):
  - `singleQuote: true`
  - `semi: false`
  - `tabWidth: 4`
  - `printWidth: 130`
- EditorConfig (`.editorconfig`):
  - Most files: indent with tabs, LF line endings, UTF-8, trim trailing whitespace, insert final newline.
  - YAML files: indent with 2 spaces.
- XO rules: extends `xo-react`, disables `react/prop-types` (TypeScript handles types).
- Use TypeScript types; avoid PropTypes.
- React components should be functional with hooks.

## Architecture

- **`source/`** – main application code (TSX/TS).
  - `cli.tsx` – entry point, parses command-line args via `meow`.
  - `app.tsx` – root Ink app, routes between interactive chat, single prompt, commit, server.
  - `actions/` – high-level agent logic (e.g. `agent.ts`, `commitMessage.ts`).
  - `commands/` – slash command definitions (`/init`, `/continue`, etc.).
  - `components/` – React/Ink UI components.
  - `core/` – shared utilities (API client, gitignore, workspace file listing, token config, etc.).
  - `prompts/` – markdown system prompts (copied to `dist/` at build).
  - `server/` – HTTP API (`rc serve`) with OpenAI-compatible endpoints.
  - `tools/` – tool definitions and execution logic.
    - `registry.ts` – central registry of available tools; system prompt generated from it.
    - `execute.ts` – dispatches tool calls to implementations.
    - `types.ts` – tool interfaces (arguments, describe, execute).
- **`core-lib/`** – low-level modules for chat sessions, streaming, and DeepSeek communication (used by `source/`).

## Key Boundaries

- **`dist/`** – generated output; never edit manually. Clean builds overwrite it.
- **`node_modules/`** – ignored; never commit.
- **Prompts** – stored in `source/prompts/` as `.md`; copied to `dist/prompts/` during build by `scripts/copy-prompts.mjs`.
- **Tool registration** – add new tools in `source/tools/` and register them in `registry.ts`; the system prompt is generated from the registry, so the tool name, description, and parameter schema must be up to date.
- **Path restrictions** – all file operations are relative to the current working directory; paths outside are rejected.
- **Sudo/Administrator** – `run_command` with `sudo` triggers a UAC dialog on Windows (via `@slosk/sudo-prompt`).

## Testing Guidelines

- Unit/integration tests are written with AVA and placed next to source files? (No explicit test directory; AVA config loads `.ts`/`.tsx` files. Currently no tests are present; create new tests in `test/` or adjacent to modules as needed.)
- Run `pnpm test` before committing; it runs linting and all tests.

## Commit Messages

- Use Conventional Commits (enforced by `rc -c` which generates a message and asks for confirmation).
- Prefer concise, imperative commit titles.

## Common Pitfalls

- **Build fails** – Ensure `pnpm install` is run; `node scripts/copy-prompts.mjs` requires `source/prompts/` to exist.
- **Missing environment** – The CLI stores its token in `~/.config/rp-cli/.env`; during development, you can set `DEEPSEEK_API_KEY` env var.
- **TUI development** – Ink apps run in a terminal; use `pnpm dev` to rebuild on changes, then test with `node dist/source/cli.js` or `rc` (if installed globally).