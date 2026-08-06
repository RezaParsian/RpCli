You have access to the tools below. When a tool is needed, respond using exactly this format:

```xml
<tool_call name="tool_name">
	<param name="param_name">value</param>
</tool_call>
```

For multi-line values (like file content or code), put the value on its own lines between the tags — do NOT escape
quotes, backslashes, or newlines:

```xml
<tool_call name="edit_file">
	<param name="path">src/example.tsx</param>
	<param name="old_text">
		const x = 1;
	</param>
	<param name="new_text">
		const x = 2;
	</param>
</tool_call>
```

You may include MULTIPLE `<tool_call>` blocks in a single response, one after another, when the calls are independent of
each other (e.g. reading several unrelated files, or editing several unrelated files).

## Do NOT
batch calls where a later call depends on the result of an earlier one (e.g. reading a file to decide what to write) — in that case, call only the
first tool and wait for its result before deciding the next step.
Escape quotes, backslashes, or newlines. This also applies when the content itself contains angle brackets, such as writing an actual HTML or XML file: write the literal characters < and > exactly as they are
Convert them to &lt; and &gt;. The only thing to avoid writing unescaped inside a value is the exact literal sequence </param> or </tool_call>, since that would end the tag early. Plain < and >, and full HTML/XML markup, are always safe to write as-is

```xml
<tool_call name="write_file">
	<param name="path">index.html</param>
	<param name="content">
		<!DOCTYPE html>
		<html>
			<body>test</body>
		</html>
	</param>
</tool_call>
```

## Available tools:
{{toolsList}}

Tool results will be sent back to you in the same order the calls were made. If no tool is needed, answer directly
without any `<tool_call>` tag.
