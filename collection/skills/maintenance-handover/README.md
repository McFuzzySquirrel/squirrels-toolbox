# maintenance-handover

Turn a completed project's build agents and skills into a maintenance team without carrying the build scaffolding forward.

The skill inventories the repository, proposes a convert-or-generate roster and an explicit retirement set, archives only approved paths, rewrites agents and project skills as maintainers, and verifies that every source area has an owner. It does not infer deletions from filenames and does not touch source, tests, CI, manifests, or historical documentation.

## When To Use It

Use this skill for requests such as:

- "The build is done; turn the agents into maintainers."
- "Clean the planning and task scaffolding out of this repository."
- "We used agents to build this; give them a support charter."
- "Generate a maintenance team from the code because the build team was never committed."

Do not use it to author requirements, start a feature, or migrate a build that is still running.

## Requirements

- Node.js 18 or newer.
- A git worktree for the default workflow. `--allow-no-git` is available for archive-only runs.
- No npm install. The scripts use Node built-ins only.

## Installation

Copy the complete skill directory into the skill location used by your assistant:

```bash
cp -r collection/skills/maintenance-handover .agents/skills/
```

Keep the directory name `maintenance-handover` unchanged. The package is self-contained and includes its `SKILL.md`, `references/`, and `scripts/`.

## Modes

| Mode | When | Result |
|---|---|---|
| Convert | In-repo agents already exist | Preserve filenames, names, models, tools, permissions, and unknown frontmatter; rewrite each role as a maintainer |
| Generate | No agents exist, or the plan sets `mode: "generate"` | Propose a roster from repository evidence, then create the team after approval |
| Retire | The approved plan lists paths | Archive or delete only those paths |

Conversion and generation are selected in `.handoff/plan.json`. The scripts never choose a mode or a removal by themselves.

## Workflow

1. **Inventory.** Run the read-only inventory. It reports the harness, agents, skills, source areas, workspaces, tests, CI, manifests, documentation, and references to any path you are considering retiring.
2. **Propose and approve.** Show the mode, retirement list, keep list, rewrite list, and support roster. Treat planning and spec documents as keep-by-default; retire machine state and build-only skills only with explicit approval.
3. **Write the plan.** Put the approved decision in `.handoff/plan.json`. The plan is working state, not project documentation, and is excluded from git.
4. **Apply.** Archive approved paths under `.handoff-archive/<timestamp>/` with a manifest, or delete them with `--delete`. Protected paths and dirty trees are refused.
5. **Convert or generate.** Rewrite existing agents in place, or generate a minimal roster from the repository's actual source areas. Preserve frontmatter fields you do not understand.
6. **Rewrite the support surface.** Convert selected project skills into maintenance runbooks. Patch references to retired paths in `README.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, CI, and package scripts.
7. **Write the charter.** Create `docs/SUPPORT.md` with ownership, intake, release checklist, escalation, and preserved build documents.
8. **Verify.** Run the gate, fix every error, and resolve or explicitly accept warnings.
9. **Report.** State what was archived, the roster, preserved documents, warnings, and the verification command. Commit only when `--commit` was explicitly requested.

## The Approved Plan

```json
{
  "version": 1,
  "mode": "convert",
  "harnessRoot": ".agents",
  "retire": ["docs/build-state"],
  "retireSkills": [],
  "retiredAgents": [],
  "preservedDocs": ["docs/spec.md"],
  "rewrite": ["README.md", "AGENTS.md"],
  "keep": [],
  "generatedAgents": []
}
```

- `mode` is `convert` or `generate`.
- `retire`, `retireSkills`, and `retiredAgents` are the only paths apply will touch. They must be concrete paths, not globs.
- `preservedDocs` lists kept planning and spec documents. Verify expects each to appear in `docs/SUPPORT.md`; preserved documents are excluded from dangling-reference checks.
- `keep` is advisory and also overrides the plan at apply time. `--keep` is the command-line equivalent.
- `rewrite` and `generatedAgents` record the proposed work for the report.

## Protected Paths

The skill refuses to retire:

- source directories and test directories detected by the inventory
- `README.md`, `LICENSE`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `.gitignore`, and changelog files
- package manifests, lockfiles, and build configuration such as `package.json`, `pyproject.toml`, `Cargo.toml`, `Makefile`, `Dockerfile`, and `tsconfig.json`
- CI workflows under `.github/workflows/`
- `docs/SUPPORT.md`, `docs/adr/`, `docs/research/`, and `docs/releases/`
- `.handoff/`, `.handoff-archive/`, and the installed skill itself

A protected file inside a directory blocks retiring that directory. Retire the surrounding files individually.

## Command Reference

Run from the target repository. Substitute `.opencode`, `.claude`, `.github`, or a root-level `agents/` layout when that is the detected harness.

### Inventory

```bash
node .agents/skills/maintenance-handover/scripts/inventory.mjs --repo . --json
```

| Flag | Purpose |
|---|---|
| `--repo <path>` | Repository root. Defaults to the current directory. |
| `--harness-root <root>` | Select `.agents`, `.opencode`, `.claude`, `.github`, or `.` (root-level `agents/` and `skills/`). |
| `--retire <path>` | Report active references to a path you are considering retiring. Repeatable. |
| `--json` | Emit machine-readable output. |

### Apply

```bash
# Dry run
node .agents/skills/maintenance-handover/scripts/apply.mjs --repo . --plan .handoff/plan.json

# Archive the approved paths
node .agents/skills/maintenance-handover/scripts/apply.mjs --repo . --plan .handoff/plan.json --apply

# Remove instead of archiving
node .agents/skills/maintenance-handover/scripts/apply.mjs --repo . --plan .handoff/plan.json --apply --delete

# Keep an extra path
node .agents/skills/maintenance-handover/scripts/apply.mjs --repo . --plan .handoff/plan.json --apply --keep docs/spec.md
```

| Flag | Purpose |
|---|---|
| `--plan <path>` | Plan file. Defaults to `.handoff/plan.json`. |
| `--apply` | Execute the plan. Without it, apply is a dry run. |
| `--delete` | Remove approved paths instead of archiving them. |
| `--keep <glob>` | Preserve a path or glob. Repeatable. Wins over the plan. |
| `--allow-dirty` | Permit a dirty worktree. |
| `--allow-no-git` | Permit a non-git directory and force archive mode. |
| `--json` | Emit machine-readable output. |

### Verify

```bash
node .agents/skills/maintenance-handover/scripts/verify.mjs --repo . --plan .handoff/plan.json
```

| Flag | Purpose |
|---|---|
| `--plan <path>` | Plan file. Defaults to `.handoff/plan.json`. |
| `--harness-root <root>` | Override the harness recorded in the plan. |
| `--strict-coverage` | Fail on uncovered source areas even in convert mode. Generate mode always enforces coverage. |
| `--commit` | Commit the verified handoff once with `chore: convert build team to support team`. |
| `--json` | Emit machine-readable output. |

## File Layout

```text
maintenance-handover/
  SKILL.md
  README.md
  package.json
  references/
    safety.md
    inventory.md
    support-team.md
  scripts/
    lib.mjs
    inventory.mjs
    apply.mjs
    verify.mjs
    handoff.test.mjs
```

## Validation

```bash
# The skill's own tests
cd .agents/skills/maintenance-handover
npm test

# The handoff gate in the target repository
node .agents/skills/maintenance-handover/scripts/verify.mjs --repo . --plan .handoff/plan.json

# Whitespace and conflict markers
git diff --check

# Review the final diff before committing
git diff --stat
```

## Scope Boundaries

- Supports directory-based agent and skill harnesses. It does not inspect globally installed agents or proprietary rule formats.
- Does not author requirements, features, or roadmap documents.
- Does not infer a deletion from a filename, directory name, or document text.
- Does not rewrite historical ADRs, research notes, changelogs, or preserved planning documents.
- Does not invent test, build, or release commands. If the repository has none, the quality bar says so.
- Does not commit unless `--commit` is explicit, and never deletes itself.

## Troubleshooting

- **Multiple harness roots detected.** Pass `--harness-root` with the primary root. The scripts refuse to guess.
- **Working tree is not clean.** Commit or stash first, or pass `--allow-dirty` deliberately.
- **Not a git repository.** Use `--allow-no-git`; the run is forced into archive mode.
- **Protected path refused.** Remove it from `retire` or retire the surrounding files individually.
- **Uncovered source area.** Broaden the owning agent's `## Scope`, add a maintainer, or use `--strict-coverage` only after the gap is understood.
- **Plan not found.** Write `.handoff/plan.json` after the user approves the proposal.

## Supporting References

- [`references/safety.md`](references/safety.md): preflight gates, protected paths, archive rules, git hygiene, the headless contract, and the no-self-deletion rule.
- [`references/inventory.md`](references/inventory.md): what the inventory reports, how to classify paths, documentation handling, and harness resolution.
- [`references/support-team.md`](references/support-team.md): role mapping, agent template, scope syntax, the support charter, and project-skill rewrites.
