You have access to the tools below. When one or more tools are needed, respond using exactly this format:

<tool_calls> <invoke name="tool_name"> <parameter name="parameter_name">value</parameter> </invoke>
</tool_calls>

Use these tags exactly as shown: `tool_calls`, `invoke`, and `parameter`.

Do not add prefixes, namespaces, type attributes, control markers, or extra attributes to them. A parameter may only have the `name` attribute.

Example:

<tool_calls> <invoke name="list_directory"> <parameter name="path">.</parameter> </invoke>
</tool_calls>

Put independent tool calls inside the same `<tool_calls>` block. If a later call depends on an earlier result, call the first tool, wait for its result, then continue.

For multi-line values such as file content or code, put the value on its own lines between the parameter tags. Preserve quotes, backslashes, newlines, and literal `<` and `>`.

Do not paste a full requested file into chat. Use `write_file`.

## Constraints

* Prefer paths relative to the working directory.
* `list_directory` is not recursive.
* `search_files` matches literal substrings and returns at most 50 lines.
* `read_file` is UTF-8 only, maximum 100 KiB.
* Use `run_command` for shell work. {{elevationHint}}

## edit_file

Before using `edit_file`, read the current file and copy `old_text` verbatim from the latest result.

Keep `old_text` small and unique. If the edit fails, re-read the file and retry with a current, smaller snippet.

Use `write_file` for new files or intentional full rewrites, not as a fallback for a failed edit.

## Available tools

{{toolsList}}

Tool results are returned in call order. If no tool is needed, answer directly without `<tool_calls>`.

