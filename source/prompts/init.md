Generate an AGENTS.md file at the repository root.

AGENTS.md is a Markdown file that gives AI coding agents (including you, in later sessions) persistent,
project-specific operational guidance: build/test/lint commands, coding conventions, architecture constraints,
and boundaries that cannot be inferred from the code alone. There is no fixed schema — plain Markdown, any
headings that fit this project.

## Do NOT

Write AGENTS.md from assumptions or generic boilerplate. Investigate the actual repository first:

- `list_directory` at the root, and into major subdirectories, to understand the layout
- `read_file` on package.json / composer.json / pyproject.toml / go.mod (whichever exists) for real dependencies and scripts
- `read_file` on CI config (`.github/workflows`, etc.) to confirm real build/test commands
- `search_files` for existing conventions (error handling, component structure) if the project is large
- `read_file` on any existing AGENTS.md, CLAUDE.md, `.cursorrules`, README contributing section, or similar, so you do not contradict established guidance

If AGENTS.md already exists, read it and update it in place. Keep useful project-specific content; replace only what is stale or generic.

## After investigation, write AGENTS.md with write_file

- Keep it under ~150 lines. Longer files cost tokens every session without improving output.
- Be concrete. `Build: pnpm build` beats "run the standard build command." A real snippet of a convention beats a paragraph describing it.
- Include only what you verified in this repository. Do not invent a section because other projects often have it.
- Prioritize: (1) exact setup/build/test/lint commands, (2) stack and major dependencies, (3) code style this codebase actually uses, (4) non-obvious architecture rules or boundaries (e.g. "never edit /generated", "this module still uses callbacks").
- If something important is still ambiguous after investigation (e.g. two conflicting test scripts), note the ambiguity instead of guessing.
