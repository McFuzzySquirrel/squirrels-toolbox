---
name: skill-creator
description: "Guide an agent through creating a new, well-structured Copilot skill from a rough idea. Runs a structured interview, applies the skill-review quality rubric during scaffolding, and validates the output with skill-review. Produces a ready-to-use skill package."
---

# Skill: Create a New Copilot Skill

You are guiding the user (or yourself) through building a new Copilot skill from scratch. The goal is not just to scaffold files - it is to produce a skill that passes the skill-review quality bar from the start. The workflow runs in five numbered steps with explicit decision points.

Load `references/quality-axes.md` now. You will use the six quality axes throughout all five steps.

---

## Process

### Step 1: Interview

Gather the information needed to build the skill well. Load `references/interview-questions.md` for the full question bank.

Ask the questions in order. Record the answers - you will use them in Steps 2–5. Do not skip questions; each one drives a specific scaffolding decision.

**Minimum required before proceeding:**
- Skill name (must match the directory name)
- One-sentence purpose
- Activation trigger phrase
- Step count and whether any branching or conditional logic exists
- Whether supporting reference material is needed

> **Calibration note:** The interview is open-ended - guide without constraining. If the user is uncertain about step count or complexity, default to modular. It is easier to collapse a modular skill than to refactor a flat one after the fact.

### Step 2: Template Selection

Based on the interview answers, choose the scaffold template:

| Signal | Template |
|--------|----------|
| ≤3 steps, no branching, no reference material | **Flat** - single `SKILL.md` |
| ≥4 steps, OR branching logic, OR supporting material | **Modular** - `SKILL.md` + `references/` |

State your choice and reasoning to the user before proceeding. Allow them to override.

Load the chosen template:
- Flat: Load `references/flat-template.md`
- Modular: Load `references/modular-template.md`

### Step 3: Scaffold

Generate the skill files using the loaded template and interview answers. Use the loaded `references/quality-axes.md` to shape each section; do not copy its scoring explanations into the new skill.

After generating, check: is `SKILL.md` under 500 lines? If not, move bulk content to `references/`.

### Step 4: Pre-flight Check

Before calling `skill-review`, run a self-check against the pre-flight list.

Load `references/preflight-checklist.md` now.

Work through every item on the checklist. For each failure:
1. State what is wrong
2. Fix it immediately
3. Mark it as resolved

Do not proceed to Step 5 until all blockers are cleared.

### Step 5: Validation

Run the formal `skill-review` audit on the newly created skill.

**Check if skill-review is available:**

Resolve the active skills root from this `skill-creator` installation and check for the sibling `skill-review/SKILL.md`. Do not assume a particular root such as `.opencode/skills`; this repository, for example, uses `.agents/skills/`.

If `skill-review` is not found, report the prerequisite clearly:

> ⚠️ **skill-review is required for validation.** Install it under the active skills root before running this step. The skill has been scaffolded but not formally validated.

If available, invoke it:

```
/skill-review Audit the skill at <path-to-new-skill>
```

**Validation loop:**
1. Review the audit findings
2. For each finding scored below 2: fix it in the skill files
3. Re-run the audit
4. Stop when all axes score ≥ 2.0 (or the user accepts the current state)

After passing, confirm the install path and remind the user to copy the skill to `<active-skills-root>/<skill-name>/`.

---

## Gotchas

- **`name` must exactly match the directory name.** A mismatch breaks skill activation. Check this before Step 5.
- **Load triggers must say *when*, not just *what*.** "Load `references/api-errors.md` if the API returns a non-200" is good. "See references/ for more" is useless and will score a 1 on progressive disclosure.
- **Do not move the first ~100 lines of SKILL.md to references/.** That content defines the skill's purpose and trigger conditions - it must stay inline even if it is verbose.
- **Gotchas must be concrete.** "Handle errors appropriately" scores a 1. "If the `users` table uses soft deletes, queries must include `WHERE deleted_at IS NULL`" scores a 3.
- **skill-review will not run on a skill that has no SKILL.md.** Ensure the file exists and has valid YAML frontmatter before Step 5.
- **Do not skip Step 4.** The pre-flight check catches issues that skill-review will flag. Fixing them before the audit saves a loop.

---

## Validation

Use the Step 4 pre-flight checklist, then confirm the formal `skill-review` audit completed (or its absence was reported) and all axes score at least 2.0, unless the user accepts the current state. Confirm the final install path using the active skills root.
