---
name: skill-review
description: "Audit skills in a project against agentskills.io best practices. Scores each skill on context economy, gotchas coverage, procedural clarity, progressive disclosure, calibration, and validation. Produces a reviewable audit report and can optionally apply targeted improvements."
---

# Skill: Review Skills Against Best Practices

You are auditing skills against the [agentskills.io best practices](https://agentskills.io/skill-creation/best-practices). Your job is to read each skill, score it against a structured rubric, produce a reviewable audit report, and - only when the user explicitly approves - apply targeted improvements.

The audit report includes a deterministic reviewer-style proxy score when no explicit human review is available. Treat that score as a proxy, not a literal human judgment.

## Embedded Tooling (Portable Install)

This skill package is self-contained. If this directory is installed as `.opencode/skills/skill-review/`, the helper scripts are available at:

- `./scripts/skill-review.ts`
- `./scripts/rubric.ts`
- `./scripts/detect.ts`
- `./scripts/providers/*.ts`

When the user asks for script-based validation, run commands from this skill directory:

```bash
npm install
npm run skill-review -- --provider stdout --min-score 1.5
```

The script auto-detects the git repository root, so it can be run from inside the skill folder.

## Process

### Step 1: Discover Skills

Search for skills across auto-detected directories: `.opencode/skills/`, `skills/`, `.opencode/skills/`, `.claude/skills/`, `templates/skills/`. Pick the first directory that exists and contains `SKILL.md` files.

Exclude the `skill-review` skill itself unless the user explicitly asks to audit it. Focus on project-specific and domain-specific skills.

Skip any skill directory that has no `SKILL.md`.

### Step 2: Audit Each Skill

For each skill, read `SKILL.md` and any `references/`, `scripts/`, or `assets/` files. Score each axis on a 1–3 scale (1 = missing, 2 = partial, 3 = strong):

| Axis | What to check | Score 3 (strong) | Score 1 (missing) |
|------|--------------|-------------------|-------------------|
| **Context economy** | Does the skill trim what the agent already knows? Are there generic explanations that waste tokens? | Specific, project-focused instructions. No "what is a PDF" explanations. | Long generic passages, explanations of fundamentals the agent knows. |
| **Gotchas coverage** | Are environment-specific edge cases, API inconsistencies, and naming mismatches documented? | Concrete gotchas that correct mistakes agents make without being told. | No gotchas section, or only generic advice like "handle errors appropriately." |
| **Procedural clarity** | Does the skill teach *how to approach* a problem (procedure) rather than *what to produce* (declaration)? | Step-by-step process with decision criteria. | Just declares what output should look like without teaching the process. |
| **Progressive disclosure** | Is content over ~50 lines of template/reference material moved to `references/` or `assets/` with load triggers? | `references/` and `assets/` used with explicit load triggers. SKILL.md under 500 lines. | Everything in one SKILL.md. No subdirectories. |
| **Calibration** | Is prescriptiveness matched to task fragility? Rigid for fragile ops, flexible for variable ops. | Clear defaults with escape hatches. Exact commands for destructive operations. | Uniform prescriptiveness, or important steps left too vague. |
| **Validation** | Are there concrete validation steps the agent can run to self-check its work? | Checklist, validator script, or self-check loop with fix-and-retry. | No verification step, or only generic "make sure it works." |

Also check:
- [ ] `name` matches parent directory name
- [ ] `name` follows the Agent Skills format: 1-64 lowercase letters, numbers, and hyphens, with no leading, trailing, or consecutive hyphens
- [ ] `description` is non-empty, no longer than 1024 characters, and states when the skill applies
- [ ] YAML frontmatter is valid
- [ ] File references use relative paths from skill root
- [ ] No more than one level of reference chain depth
- [ ] Bundled scripts are non-interactive, document `--help` or usage, and emit actionable errors; use structured output and safety controls when applicable
- [ ] Skills that produce artifacts or execute workflows have realistic eval cases, an edge case, and observable assertions, unless an explicit exemption is justified

  Eval cases live in `evals/evals.json` at the skill root:

  ```json
  {
    "skill": "{skill-name}",
    "cases": [
      {
        "id": "kebab-case-id",
        "kind": "happy-path",
        "prompt": "Realistic request a user would make.",
        "assertions": ["Observable behavior the response must show."]
      }
    ]
  }
  ```

  Behavior-heavy skills need at least one `happy-path` and one `edge-case` case. `kind` accepts only those two values, so a typo reads as a typo instead of a third category. Each assertion names something visible in the response — a decision made, a command run, a file written — not an internal intention.

  Record an exemption in the skill's own `## Validation` section as `Eval exemption: {why the skill is informational}`. A recorded exemption satisfies this check; a missing `evals/` directory with no such line does not.

Before applying any edits, write a short review plan that lists the top issues, the proposed changes, and the reason for each change. Present that plan to the user first.

### Step 3: Produce Audit Report

Write the audit report at `docs/SKILL-AUDIT.md` or present it inline, using this structure:

````markdown
# Skill Audit Report

**Generated:** YYYY-MM-DD
**Audited by:** `skill-review`
**Skills audited:** {count}

---

## Summary Scores

| Skill | Context | Gotchas | Procedure | Progressive | Calibration | Validation | Overall |
|-------|---------|---------|-----------|-------------|-------------|------------|---------|
| `{name}` | 2 | 1 | 3 | 1 | 2 | 2 | 1.8 |

**Score interpretation:**
- 2.5–3.0: Strong - follows best practices well
- 1.5–2.4: Adequate - works but has improvement opportunities
- 1.0–1.4: Needs work - significant gaps against best practices

---

## Per-Skill Findings

### `{skill-name}`

**Overall score:** {score}

**Strengths:**
- {What the skill does well}

**Improvement opportunities:**
- {Specific, actionable suggestion}
- {Another suggestion}

**Suggested changes (requires approval):**
1. Add `## Gotchas` section with: {specific gotchas to add}
2. Move {content} to `references/{file}.md` with load trigger: "Load when {condition}"
3. Add validation loop: "{concrete check}"
4. Trim {specific verbose section}: "{what to cut}"

---

### `{skill-name}`
{Repeat for each skill}

---

## Next Steps

Review the suggested changes above. To apply them, run:
`/skill-review Apply the approved changes from the audit report`
````

### Step 4: Present and Wait

Present a summary of the audit scores and highlight the top 3 improvement opportunities. Ask the user whether to apply changes. **Never apply changes without explicit user confirmation.**

If the user approves specific changes, proceed to Step 5.

### Step 5: Apply Approved Changes (opt-in only)

For each approved change:

1. **Add gotchas:** Insert a `## Gotchas` section with the suggested content. Place it after `## Process` or before `## Reference` - consistent with the skill's own conventions.

2. **Move to progressive disclosure:** Create the `references/` or `assets/` directory under the skill. Extract the identified content into the new file. Replace with a load trigger in `SKILL.md` (e.g., "Load `references/schema.md` for the full output format structure.")

3. **Add validation:** Insert a `## Validation` section with checkboxes or a validation script invocation.

4. **Trim verbose content:** Remove generic explanations the agent already knows. Replace with a concise instruction.

5. **Add calibration markers:** For fragile operations, add explicit commands. For flexible operations, add "if that doesn't work, try X" escape hatches.

After applying changes, regenerate the audit report with updated scores. Show the user what changed.

---

## Gotchas

- **Don't modify meta-skills** (skills that audit or build other skills) unless explicitly asked. These follow their own conventions and are version-controlled separately.
- **Don't move content that's essential for activation.** The first ~100 lines of `SKILL.md` define the skill's purpose and trigger conditions. Keep that inline even if it is verbose.
- **Load triggers must be specific.** "Load `references/api-errors.md` if the API returns a non-200 status code" is good. "See references/ for details" is useless.
- **Validation scripts in `scripts/` must be self-contained.** Don't recommend scripts the user can't run without missing dependencies.
- **Agent-facing scripts must not prompt for TTY input.** Use flags, environment variables, or stdin and return a clear error with usage guidance when required input is missing.
- **Keep script output machine-readable where it is consumed by another step.** Put structured results on stdout and diagnostics on stderr so the agent can recover from failures.
- **Do not require eval infrastructure for purely informational skills.** Record the reason for an exemption instead of treating the absence of `evals/evals.json` as an automatic failure.

## Validation

- [ ] Run the targeted rubric tests from the skill directory: `npm test`
- [ ] Run the type check: `npm run typecheck`
- [ ] Confirm every structural finding names the violated metadata or activation rule
- [ ] For behavior-heavy skills, inspect eval cases and assertions or record an explicit exemption
- [ ] Re-run the audit after fixing findings and confirm the report no longer contains stale structural issues

---

## Guidelines

- **Audit project skills, not meta-skills.** Meta-skills (like this one) are maintained separately.
- **Score honestly.** A low score isn't a failure - it's actionable data. Every skill can improve.
- **Be specific in suggestions.** "Add gotchas" is not helpful. "Add gotcha: 'The `users` table uses soft deletes - queries must include `WHERE deleted_at IS NULL`'" is.
- **One pass at a time.** Apply changes, regenerate the audit, and stop. Don't loop until perfect - real-world execution feedback (per the best practices) drives the next iteration.
