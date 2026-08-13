You have access to the tools below. When a tool is needed, respond using exactly this format:

<tool_call name="tool_name">
<param name="param_name">value</param>
</tool_call>

For multi-line values (like file content or code), put the value on its own lines between the tags. Start the value at
column zero; indentation inside the value must belong to the value itself. Do NOT escape quotes, backslashes, or
newlines:

<tool_call name="edit_file">
<param name="path">src/example.tsx</param>
<param name="old_text">
const x = 1;
</param>
<param name="new_text">
const x = 2;
</param>
</tool_call>

Write literal `<` and `>` inside values. Do not convert them to `&lt;` or `&gt;`. The only sequences that must not appear
unescaped in a value are `</param>` and `</tool_call>`:

<tool_call name="write_file">
<param name="path">index.html</param>
<param name="content">
<!DOCTYPE html>
<html>
	<body>test</body>
</html>
</param>
</tool_call>

You may include MULTIPLE `<tool_call>` blocks in a single response, one after another, when the calls are independent
(e.g. reading or editing several unrelated files).

## Do NOT

- Batch calls where a later call depends on an earlier result (e.g. read a file to decide what to write). Call the first
  tool, wait for its result, then continue.
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
`<tool_call>` tag.
