# Handoff Inventory

Load this file when reading the inventory output, when a path is ambiguous, or
when the user asks why a file is kept, rewritten, or proposed for retirement.

The inventory is read-only. It reports evidence; it does not decide what to
delete.

## What the inventory reports

| Area | What it answers |
|---|---|
| Harness | Which agent root was detected, and whether multiple roots compete |
| Agents | Every agent file, its frontmatter, and the paths in its `## Scope` |
| Skills | Every project skill, its frontmatter, and its directory name |
| Source areas | Top-level source directories, `src/*`, and workspace package sources |
| Workspaces | Packages under `packages/`, `apps/`, `crates/`, and `modules/` |
| Tests | Test directories and test/spec files |
| CI | Workflow, pipeline, and Jenkins files |
| Manifests | Package, build, container, and task manifests |
| Documentation | Markdown under `docs/`, marked historical where applicable |
| References | Lines that mention a path the caller is considering retiring |

## Classification vocabulary

Use four buckets in the plan:

- **keep** — the path survives unchanged, often a planning, spec, design, or
  decision document that still explains the project.
- **rewrite** — the path survives but its references to retired paths,
  commands, or build workflow must be removed.
- **retire** — the path is archived or deleted after explicit approval.
- **review** — the agent cannot classify the path from evidence and must ask.

The inventory may suggest candidates, but only the user-approved plan can move a
path into **retire**.

## Choosing retirement candidates

Retire machine state and build-only scaffolding, not the record of why the
project exists.

Good candidates:

- task manifests, engine state, progress logs, and generated execution reports
- tool-specific authoring state and per-run caches
- prompts, templates, or scripts whose only purpose was generating the build
- skills that exist solely to author requirements or drive the build

Require explicit approval for:

- planning documents, specs, design notes, and research
- skills that mix build and maintenance procedures
- anything whose name or purpose the agent cannot explain from evidence

Never retire:

- source, tests, CI, manifests, licenses, README, architecture notes,
  contributing guidance, ADRs, research notes, changelogs, or the support
  charter
- a path whose only evidence is its name

## Documentation

A document is **historical** when it sits under `docs/adr/`, `docs/research/`,
`docs/releases/`, or is a changelog. Historical documents are not scanned for
dangling references and are never rewritten.

A kept planning or spec document stays in place. List it under
**Preserved build documents** in `docs/SUPPORT.md` so a future maintainer knows
it describes the build rather than current behavior. Do not add a banner unless
the user explicitly asks for historical marking.

## References and rewriting

When a path is in the approved retirement set, the inventory reports every
active line that mentions it. Rewrite those references in:

- `README.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`
- active documentation under `docs/`
- agent descriptions and bodies
- project skills that survive
- package scripts, CI workflows, and build configuration

Patch the specific reference. Do not rewrite a document that is merely old but
still accurate.

## Harness detection

The inventory looks for a root that contains `agents/` or `skills/`:

- `.agents`, `.opencode`, `.claude`, `.github`
- root-level `agents/` and `skills/`

When exactly one candidate exists, it is selected. When none exists, generation
may create one after the user chooses. When several exist, ask which is primary;
do not silently take the first.
