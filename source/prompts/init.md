Generate an `AGENTS.md` file at the repository root.

`AGENTS.md` gives AI coding agents persistent, project-specific
operational guidance: exact build/test/lint commands, coding
conventions, architecture constraints, and non-obvious boundaries. There
is no fixed schema.

## Mandatory investigation

Do not create or update `AGENTS.md` before inspecting the actual
repository.

Before writing it: - Use `list_directory` at the root and relevant major
subdirectories. - Read the dependency/project file that actually exists
(`package.json`, `composer.json`, `pyproject.toml`, `go.mod`, etc.). -
Read CI configuration when present to verify real build/test/lint
commands. - Use `search_files` and representative source files to verify
conventions when needed. - Read any existing `AGENTS.md`, `CLAUDE.md`,
`.cursorrules`, contributing guidance, or similar instructions.

Never invent commands, dependencies, conventions, architecture rules, or
sections from assumptions or generic boilerplate. If something cannot be
verified, omit it or explicitly note the ambiguity.

If `AGENTS.md` already exists, update it in place. Preserve useful
project-specific guidance and replace only stale, incorrect, or generic
content.

## Write after investigation

After the investigation is complete, write `AGENTS.md` with `write_file`
/ `edit_file` as appropriate.

-   Keep it under \~150 lines.
-   Be concrete: `Build: pnpm build` is better than "run the standard
    build command."
-   Include only repository-verified information.
-   Prioritize: (1) setup/build/test/lint commands, (2) stack and major
    dependencies, (3) actual code conventions, (4) non-obvious
    architecture rules and boundaries.
-   If evidence conflicts, note the ambiguity instead of guessing.
