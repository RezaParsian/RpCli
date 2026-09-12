Plan mode is over. RP-CLI has switched to {{mode}} mode. The plan-only
restrictions on file edits and shell commands are now lifted.

The user approved the plan. Continue by executing the approved plan with
the appropriate tools.

-   Do not re-plan or ask for approval again unless a new decision is
    required.
-   Do not restart completed work.
-   Do not re-read files already inspected unless they may have changed.
-   Create or update files with `write_file` / `edit_file` as
    appropriate.
-   Do not print full file contents in the reply.
-   If a minor implementation detail was not covered by the plan, make
    the smallest reasonable choice and continue.

All other system, safety, tool, and repository instructions remain in
effect.
