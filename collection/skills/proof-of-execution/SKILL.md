---
name: proof-of-execution
description: "Produce a Proof of Execution (Po) record showing a skill actually did what it claims. Temporarily appends a record-keeping step to a chosen skill, captures evidence from a real run, lets the user review and sanitize it, then removes the step and adds a po-verified metadata tag on confirmation. Use when someone wants to verify, trust, or certify a skill they wrote or are evaluating."
---

# Skill: Proof of Execution (Po)

Verify that a skill really performs its intended job. You temporarily instrument the target skill, have it run on a real task, capture an evidence record, and only after the user confirms the record, remove the instrumentation and tag the skill as verified.

The record is agent-written evidence. The user's confirmation is the trust anchor. A `po-verified` tag means "a human confirmed one recorded run", not "this skill is correct".

## When to use this skill

Use when someone wants evidence that a skill they wrote or are considering really does its job. Do not use it to review a skill's wording or structure; use `skill-review` for that.

## References

- [Po step snippet](references/po-step-snippet.md "Load in step 2, when instrumenting the target skill") - the exact block to append.
- [Record template](references/record-template.md "Load in step 4, when the record is written") - the evidence record format.
- [Sanitization checklist](references/sanitization-checklist.md "Load in step 5, only when the user wants a sidecar") - redaction rules.

## Inputs

- Target skill path (a directory containing `SKILL.md`). Ask if not given.
- A real, representative task to run the skill on. Ask if not given.
- Optional: record directory. Default `~/.po/records/<skill-name>/`, outside any repository.

## Process

### Step 1: Preflight

1. Confirm the target `SKILL.md` exists and has frontmatter with `name` and `description`.
2. Run `git status --porcelain -- <skill-dir>`. If dirty, stop and ask the user to commit or stash; the revert in step 6 relies on a clean baseline. If the skill is not in git, copy `SKILL.md` to `<record-dir>/<timestamp>.SKILL.md.bak`.
3. Compute `sha256sum <skill-dir>/SKILL.md` and keep it as `original-sha256`.
4. Note the skill's stated intent from its `description` and any expected outcomes in its body. This is the claim being tested.
5. If the skill has side effects (writes files, runs commands, calls services), suggest a scratch directory or dry run and get the user's go-ahead.

### Step 2: Instrument

Append the block from [references/po-step-snippet.md](references/po-step-snippet.md) to the very end of the target `SKILL.md`, unchanged, including its `PO:BEGIN` and `PO:END` markers. Do not edit anything else in the skill.

### Step 3: Run

Execute the target skill on the agreed task, following its instructions as written, including the appended Po step as the last step. Do not skip steps or "help" the skill; deviations are evidence. If the run fails or is aborted, still go to step 6 (revert).

### Step 4: Record

The Po step writes the record to `<record-dir>/<timestamp>.md` using [references/record-template.md](references/record-template.md). Every claim in the record must point to something observable: a command and its exit code, a file path with size or hash, or output quoted from the run. Mark anything you cannot evidence as `unverified`; never fill gaps with plausible text.

### Step 5: Review and sanitize

1. Show the user the record and ask them to check it against what they saw happen.
2. Ask whether they want a sanitized copy for a sidecar. If yes, apply [references/sanitization-checklist.md](references/sanitization-checklist.md), show the list of redactions, and have the user approve the sanitized text. The raw record always stays outside the repository.
3. Ask for an explicit verdict: `confirm` or `reject`. Silence or "looks fine, maybe" is not confirmation.

### Step 6: Finalize

Always remove the Po step first, whatever the verdict:

1. Delete everything from `<!-- PO:BEGIN -->` through `<!-- PO:END -->` inclusive, plus the blank line before it.
2. Verify `sha256sum <skill-dir>/SKILL.md` equals `original-sha256` (or `git diff` is empty).

On `reject`: stop here, keep the raw record outside the repo for reference, add no tag.

On `confirm`, add to the frontmatter under `metadata:` (create the block if missing):

```yaml
metadata:
  po-verified: "YYYY-MM-DD"
  po-record-sha256: "<sha256 of the raw record file>"
  po-skill-sha256: "<original-sha256>"
```

If the user approved a sanitized copy, save it as `<skill-dir>/references/po/<YYYY-MM-DD>.md` and mention it in the final summary. Otherwise write no sidecar.

### Step 7: Validate

- `grep -rn "PO:BEGIN\|PO:END" <skill-dir>` returns nothing.
- `git diff -- <skill-dir>` shows only the `metadata` frontmatter lines and, if approved, the sidecar file.
- Frontmatter still parses and `name` is unchanged.

## Gotchas

- The Po step is part of the skill during the run, so the agent can see it and may tailor its behavior. Keep the step purely observational and do not mention it in the task prompt.
- Records capture real commands, paths, usernames, and output, which often contain secrets. Never write a raw record inside a repository, and never create a sidecar without the sanitization pass.
- Editing `SKILL.md` after verification makes the tag stale. `po-skill-sha256` is the hash of the file before the tag was added; to check a tag later, remove the `po-*` metadata lines (and an empty `metadata:` block if you created it), rehash, and compare. A mismatch means unverified; re-run Po.
- One passing run proves little about edge cases. State in the record which scenario was exercised and do not describe the skill as generally verified.
- Skills that edit their own files or the repo during the run will make the clean-diff check fail; scope the check to the skill directory and note unrelated changes in the record.
- If the skill already has `metadata`, merge the `po-*` keys instead of replacing the block; re-verification overwrites old `po-*` values.
- Aborted runs leave the Po block in place. Step 6 must run on every exit path; the recovery is `git checkout -- <skill-dir>/SKILL.md` or restoring the `.bak` copy.

## Validation

- [ ] `grep -rn "PO:BEGIN\|PO:END" <skill-dir>` returns nothing.
- [ ] `sha256sum` of the restored `SKILL.md` equals `original-sha256` before any tag is added.
- [ ] `git diff -- <skill-dir>` shows only the `metadata` frontmatter lines and, if approved, the sidecar file.
- [ ] Frontmatter still parses and `name` is unchanged.
- [ ] No `po-verified` tag exists unless the user typed an explicit confirmation.
- [ ] No raw record is inside the repository; any sidecar was sanitized and approved.
- [ ] `skill-review` was run on this skill after material changes.
