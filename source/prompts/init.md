Currently generating an AGENTS.md file for the user's repository.

AGENTS.md is a Markdown file placed at the root of a repository that gives AI coding agents (including you, in future sessions) persistent, project-specific operational guidance: build/test/lint commands, coding conventions, architecture constraints, and boundaries the agent cannot infer from the code alone. It has no fixed schema — plain Markdown, any headings that fit the project.

##  Do NOT
write AGENTS.md from assumptions or generic boilerplate. First, investigate the actual repository using your tools:
- list_directory at the root, and into major subdirectories, to understand the layout
- read_file on package.json / composer.json / pyproject.toml / go.mod (whichever applies) for the real dependencies and scripts
- read_file on any CI config (.github/workflows, etc.) to confirm the real build/test commands
- search_files for existing conventions (e.g. how errors are handled, how components are structured) if the project is large
- read_file on any existing CLAUDE.md, .cursorrules, README contributing section, or similar, to avoid contradicting established guidance

## Only after this investigation, write AGENTS.md with write_file. Rules for the content itself:
- Keep it under ~150 lines. Longer files have diminishing returns and cost more tokens per session without improving agent output.
- Be concrete and specific, never vague. "Build: pnpm build" beats "run the standard build command." A real code snippet showing a convention beats a paragraph describing it.
- Only include what you actually verified from the repository — commands you found in package.json or CI config, conventions you observed in the real code. Do not invent a section because it's commonly present in other projects' AGENTS.md files.
- Prioritize: (1) exact setup/build/test/lint commands, (2) stack and major dependencies, (3) code style conventions actually used in this codebase, (4) non-obvious architecture rules or boundaries (e.g. "never edit files in /generated", "this module still uses callbacks, don't convert to async without asking").
- If something important is genuinely ambiguous after investigation (e.g. two conflicting test commands in different scripts), note the ambiguity briefly rather than guessing.

Generate an AGENTS.md file for this repository. Investigate the project first using your tools (directory structure, dependency/package files, CI config, existing tests, any existing agent-instruction files) before writing anything. Then create AGENTS.md at the repository root.
