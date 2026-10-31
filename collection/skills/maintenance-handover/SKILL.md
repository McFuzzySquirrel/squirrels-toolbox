---
name: maintenance-handover
description: "Convert a completed project's build agents and skills into a repository-derived maintenance team, preserving useful roles, rewriting them as maintainers, and optionally retiring explicitly approved build artifacts. Use when the build is finished, the planning scaffolding should be cleaned up, and the agents should continue as maintainers."
---

# Build-to-Maintenance Handover

Use this skill after a project's build is complete and accepted. The build
team stops being a delivery team and becomes the maintenance team. Requirements,
task state, and build-only skills may be retired, but only when the user
approves each path. The surviving agents are rewritten from the code that
actually exists, not from their old build responsibilities.

This is a destructive migration when a retirement list is approved. The default
is conversion: no path is removed unless it is in the approved plan.

## When to use this skill

- The implementation is complete and the user wants the build scaffolding gone.
- The agents that built the project should continue as maintainers.
- The project has no in-repo agents yet, but the user wants a maintenance team
  generated from the repository.

Do **not** use this skill to author requirements, start a new feature, or
migrate a build that is still running.

## Process

### Step 0: Resolve the repository and load the safety contract

Load [`references/safety.md`](./references/safety.md) now. It defines the
preflight gates, protected paths, archive rules, and commit contract.

1. Resolve the repository root from the prompt, `--repo`, or the current
   directory.
2. Detect the harness root. Supported locations are `.agents`, `.opencode`,
   `.claude`, `.github`, and root-level `agents/` plus `skills/`.
3. If several harness roots exist, then ask which is primary. If none exists,
   then ask which root to create, defaulting to `.agents`.
4. Confirm the repository is a git worktree. If it is not, stop and ask the user
   to initialize git, or continue only with `--allow-no-git` and archive mode.
   If that does not work, stop and report the failing gate.
5. Confirm the working tree is clean. If it is dirty, ask the user to commit or
   stash; continue only with `--allow-dirty`.

If a gate fails, stop. Do not remove files to "make room".

### Step 1: Build the inventory

Run the read-only inventory from the installed skill directory:

```bash
node .agents/skills/maintenance-handover/scripts/inventory.mjs --repo . --json
```

Use the detected harness root instead of `.agents` when it differs. Add
`--retire <path>` for each path the user is considering; the inventory will
report every active line that refers to it. The command writes nothing.

Load [`references/inventory.md`](./references/inventory.md) when a path is
ambiguous, when the harness is unclear, or when the user asks why something is
being kept or proposed for retirement.

### Step 2: Choose the mode and propose the plan

Choose the mode from evidence:

- **convert** when in-repo agents exist
- **generate** when no agents exist, or when the user explicitly asks for a
  generated team

Build the ownership map from the repository, not from the old agent prose:

1. Read the source directories, workspace packages, manifests, tests, CI, and
   package scripts reported by the inventory.
2. For each existing agent, identify the paths it actually understands. Use its
   old responsibilities only as a hint; confirm against the files.
3. Check coverage in both directions:
   - every source area belongs to at least one agent
   - every agent owns at least one real area
4. If an area is unowned, broaden the closest maintainer or ask before adding a
   role.
5. If an agent owns nothing, recommend merging it or removing it. Do not keep a
   role without a repository surface.

Propose the retirement set explicitly. Retire machine state, generated task
files, and build-only skills. Keep planning, spec, and design documents in
place; they are often the only explanation of why the project exists. Do not
infer a deletion from a filename alone.

Show the user, in this order:

1. The selected harness and mode.
2. The proposed retire list, with a reason for each path.
3. The keep list, including preserved build documents.
4. The rewrite list for agents, skills, docs, and config.
5. The support roster and each agent's ownership.

Wait for explicit approval before writing the plan.

### Step 3: Write the approved plan

Write `.handoff/plan.json` only after approval. The apply and verify scripts
consume this file; they do not infer anything else.

```json
{
  "version": 1,
  "mode": "convert",
  "harnessRoot": ".agents",
  "retire": ["docs/old-task-state.json"],
  "retireSkills": [],
  "retiredAgents": [],
  "preservedDocs": ["docs/spec.md"],
  "rewrite": ["README.md", "AGENTS.md"],
  "keep": [],
  "generatedAgents": []
}
```

- `mode` is `convert` or `generate`.
- `retire`, `retireSkills`, and `retiredAgents` are the only paths apply will
  touch.
- `preservedDocs` lists kept planning and spec documents. Verify expects each to
  appear in `docs/SUPPORT.md`; preserved documents are excluded from dangling
  reference checks.
- `keep` is advisory; `--keep` also overrides the plan at apply time.
- `generatedAgents` records the proposed roster for the report.

The plan is working state, not project documentation. Do not commit it.

### Step 4: Apply the retirement list

```bash
node .agents/skills/maintenance-handover/scripts/apply.mjs --repo . --plan .handoff/plan.json --apply
```

By default, the script archives each approved path under
`.handoff-archive/<timestamp>/` and writes `HANDOFF-MANIFEST.json`. Add
`--delete` only when the user explicitly wants irreversible removal. Add
`--keep <glob>` for any path that must survive. Add `--allow-dirty` or
`--allow-no-git` only when the user accepted the weaker recovery story.

The script adds `.handoff/` and `.handoff-archive/` to `.gitignore` when they are
missing, and never removes user entries.

### Step 5: Convert the existing agents

Load [`references/support-team.md`](./references/support-team.md) before writing
any agent.

For each agent in the rewrite list:

1. Keep the filename and `name`.
2. Preserve `model`, tools, permissions, and unknown frontmatter fields.
3. Rewrite `description` as one line with no build-phase language.
4. Write `## Scope` with backticked paths and globs that exist in the
   repository.
5. Write `## Support Responsibilities` covering fixes, regression tests,
   dependency and security updates, performance, docs for the owned area, and
   review of changes in that area.
6. Write `## Triage and Escalation` with the reproduce → isolate → fix → verify
   → release path and the handoff to the lead.
7. Write `## Quality Bar` with the repository's real commands.
8. Write `## Collaboration` naming the roles it works with.
9. Remove requirement IDs, feature references, task contracts, phase numbers,
   and links to retired artifacts.

Identify the lead from its role and description and rewrite it in place. Do not
rename it. Do not preserve headings that only made sense during the build.

### Step 6: Generate a team when none exists

When generating, propose the roster and wait for approval before creating files.

- one lead plus one maintainer per major source area
- include workspace packages under `packages/`, `apps/`, `crates/`, and
  `modules/`
- merge tiny areas; cap the roster around six agents
- add quality, infrastructure, or documentation maintainers only when tests,
  deployment, or user docs actually exist
- create no role without a real repository surface

Generate minimal frontmatter: `name` and `description`. Add `mode: all` for
`.opencode` agents and other harness-specific fields only where the target root
requires them.

### Step 7: Rewrite skills, documentation, and configuration

Project skills:

- Keep the name and valid frontmatter.
- Convert build steps into maintenance runbooks: when to use, inputs,
  procedure, verification, failure modes.
- Rewrite a skill that references a retired path so the reference is gone.
- Retire a skill only when it is in the approved plan.

Active documentation:

- Create or update `docs/SUPPORT.md` from the ownership map.
- Update `README.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, and
  `ARCHITECTURE.md` when they mention a retired path or the build workflow.
- Update CI workflows and package scripts that call a retired command.
- Leave historical ADRs, research notes, changelogs, and preserved build
  documents intact. Do not rewrite history.
- Add a one-line historical banner to a kept document only when the user
  explicitly asks for one; otherwise leave the file byte-for-byte untouched.

### Step 8: Verify

```bash
node .agents/skills/maintenance-handover/scripts/verify.mjs --repo . --plan .handoff/plan.json
```

Add `--strict-coverage` when the team was generated, when the user asks for a
strict gate, or when the converted team should own every source area. The gate
fails on leftover retirement paths, dangling references, invalid frontmatter,
missing scopes, missing scope paths, a missing support charter, and uncovered
areas in generate mode.

Fix every error and rerun. Warnings about uncovered areas, ownerless agents, or
support-charter gaps must be resolved or explicitly accepted by the user.

### Step 9: Report the handoff

Tell the user:

- what was archived or removed, and where the archive is
- the support roster and each agent's scope
- which build documents were preserved
- any accepted warnings or open ownership decisions
- the exact verification command that passed
- that changes are uncommitted unless `--commit` was explicitly requested

Do not commit unless the invocation explicitly includes `--commit`. The skill
does not delete itself; it remains installed for future handoffs.

## Required evidence rules

- Prefer source code, manifests, CI, tests, and observed command output over old
  agent prose or planning documents.
- Never retire a path because its name looks like build scaffolding. The plan
  must name every retirement.
- Preserve frontmatter fields you do not understand; they may control model,
  tools, permissions, or invocation.
- Do not invent test, build, or release commands. If the repository has none,
  say so in the quality bar.
- Keep product decisions with the human. The skill proposes ownership; the user
  approves it.

## Outputs

Default paths:

- `.handoff/plan.json` — approved migration plan, not committed
- `.handoff-archive/<timestamp>/` — archived paths and
  `HANDOFF-MANIFEST.json`
- `docs/SUPPORT.md` — support charter
- rewritten agents under the selected harness root
- rewritten project skills, active docs, CI, and package scripts
- `.gitignore` entries for the generated directories

Load these references when writing the corresponding artifact:

- Load [`references/safety.md`](./references/safety.md) before applying,
  archiving, or committing.
- Load [`references/inventory.md`](./references/inventory.md) when classifying
  paths or resolving harness ambiguity.
- Load [`references/support-team.md`](./references/support-team.md) before
  rewriting agents, generating a roster, or writing the support charter.

## Validation checklist

- [ ] The harness root was selected explicitly when several existed.
- [ ] The retirement plan was approved and written to `.handoff/plan.json`.
- [ ] No protected path, source directory, test directory, or support charter is
  in the retirement set.
- [ ] Every retired path is gone or archived, and no active file references it.
- [ ] Every surviving agent has valid frontmatter, a matching name, a one-line
  description, and a `## Scope` with real paths.
- [ ] Every source area is owned; generated teams have no uncovered areas.
- [ ] No agent owns nothing.
- [ ] `docs/SUPPORT.md` names every agent and includes ownership, intake,
  release, escalation, and preserved documents.
- [ ] Project skills have valid frontmatter and no retired references.
- [ ] Active docs, CI, and package scripts no longer call retired commands.
- [ ] Historical ADRs, research notes, changelogs, and preserved documents were
  not rewritten.
- [ ] `verify.mjs` exits 0, and any remaining warnings were accepted.
- [ ] Changes are uncommitted unless `--commit` was explicitly requested.

## Gotchas

- **Deleting a referenced path leaves dead links.** An agent that says "read
`docs/plan.md`" is broken once the file is gone. Rewrite the reference in the
same migration, and let the verifier catch what you missed.

- **A filename is not evidence.** `plan.md`, `spec.md`, and `tasks/` can be active
documentation in one repository and disposable build state in another. The
inventory may suggest; only the approved plan retires.

- **Renaming the lead breaks the team.** Agent names appear in support charters,
cross-references, and user habits. Preserve the existing name and rewrite the
role in place; create `support-lead` only when generating from scratch.

- **Dropping frontmatter silently changes behavior.** `model`, tools, permissions,
and harness-specific fields are not decoration. Preserve every field you do not
understand.

- **An agent with no scope is a fiction.** A role that owns nothing cannot triage,
review, or fix. Merge it or remove it with the user's approval.

- **A generated team that misses workspace packages is worse than no team.**
Monorepos hide source under `packages/`, `apps/`, `crates/`, and `modules/`.
Check the inventory's workspace list before approving the roster.

- **One frontmatter schema does not fit every harness.** OpenCode uses fields that
Claude or a root-level `agents/` directory may reject. Preserve on conversion;
emit minimally on generation.

- **A kept spec becomes a trap when nobody labels it.** List preserved documents
in `docs/SUPPORT.md` and say they describe the build, not current behavior.
Do not edit the documents themselves unless the user asks.

- **The archive is not a substitute for review.** Archiving keeps a recovery path,
but the diff still needs a human before it is committed. Report the archive and
the verification command.

- **Self-deletion would make the tool single-use.** This skill is meant to be run
again on another project. It never removes itself or its installed directory.

## References

All reference material lives in [`references/`](references/).

- [`references/safety.md`](./references/safety.md) — preflight gates, protected paths, archive rules, and the commit contract.
- [`references/inventory.md`](./references/inventory.md) — path classification, documentation handling, and harness resolution.
- [`references/support-team.md`](./references/support-team.md) — role mapping, agent template, scope syntax, support charter, and skill rewrites.
