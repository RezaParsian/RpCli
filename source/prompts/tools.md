You have access to the tools below. When one or more tools are needed, respond using exactly this format:

<tool_calls>
<invoke name="tool_name">
<parameter name="parameter_name">value</parameter>
</invoke>
</tool_calls>

Put every independent tool invocation inside the same `<tool_calls>` block. For multi-line values (like file content or
code), put the value on its own lines between the tags. Start the value at column zero; indentation inside the value must
belong to the value itself. Do NOT escape quotes, backslashes, or newlines:

<tool_calls>
<invoke name="edit_file">
<parameter name="path">src/example.tsx</parameter>
<parameter name="old_text">
const x = 1;
</parameter>
<parameter name="new_text">
const x = 2;
</parameter>
</invoke>
</tool_calls>

Write literal `<` and `>` inside values. Do not convert them to `&lt;` or `&gt;`. The only sequences that must not appear
unescaped in a value are `</parameter>`, `</invoke>`, and `</tool_calls>`:

<tool_calls>
<invoke name="write_file">
<parameter name="path">index.html</parameter>
<parameter name="content">
<!DOCTYPE html>
<html>
	<body>test</body>
</html>
</parameter>
</invoke>
</tool_calls>

You may include MULTIPLE `<invoke>` blocks in a single `<tool_calls>` block when the calls are independent (e.g. reading
or editing several unrelated files).

## Do NOT

- Batch calls where a later call depends on an earlier result (e.g. read a file to decide what to write). Call the first
  tool, wait for its result, then continue.
- Output an `<invoke>` outside the single `<tool_calls>` wrapper.
- Add `DSML` prefixes or control markers to any tag. Write `<tool_calls>` exactly as shown above.
- Escape quotes, backslashes, or newlines in multi-line values.
- Convert literal `<` and `>` to `&lt;` / `&gt;`.
- Paste a full file into the chat. Use `write_file` so it lands on disk.

## Constraints

- Prefer relative paths from the working directory. Paths outside it will be rejected.
- `list_directory` is not recursive.
- `search_files` matches a literal substring (not regex) and returns at most 50 lines.
- `read_file` is UTF-8 only, maximum 100 KiB.
- `run_command` for shell work in the working directory. {{elevationHint}}

## edit_file rules

`old_text` must be copied VERBATIM from the most recent `read_file` or `tool_result` for that exact file — never retyped
from memory, and never copied from your own earlier attempt (it may already be wrong). Keep `old_text` SMALL: a few
lines around the change, just enough to be unique — not the whole file, and not a whole function if only one line
changes. For several unrelated regions in the same file, issue several small `edit_file` calls. Use `write_file` only
for a new file or a deliberate full rewrite — not as a fallback after `edit_file` fails. If `edit_file` fails to match,
re-read the file and retry with a smaller, verbatim snippet.

## Available tools:

{{toolsList}}

Tool results are returned in the same order as the calls. If no tool is needed, answer directly without any
`<tool_calls>` tag.
