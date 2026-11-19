# Po Step Snippet

Append this block verbatim to the end of the target `SKILL.md`, preceded by one blank line. Replace `<record-dir>` and `<timestamp>` (UTC, `YYYYMMDDTHHMMSSZ`) with real values.

````markdown
<!-- PO:BEGIN -->
## Final Step: Record Proof of Execution

This is the last step of the run. Do not change how earlier steps were performed.

1. Create `<record-dir>/<timestamp>.md` following `proof-of-execution/references/record-template.md`.
2. Fill it only from what actually happened in this run: the stated intent of this skill, each step you performed or skipped, commands with exit codes, files created or changed (path plus size or hash), outputs compared with the skill's expected outcomes, and any deviation or error.
3. Mark anything you cannot point to evidence for as `unverified`.
4. Tell the user where the record is and ask them to review it. Do not edit this skill file.
<!-- PO:END -->
````
