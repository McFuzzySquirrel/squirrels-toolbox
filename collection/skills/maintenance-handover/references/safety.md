# Handoff Safety

Load this file before applying deletions, archiving, or committing.

## Preflight gates

Stop when any of these is true:

- the directory is not a git worktree and `--allow-no-git` was not passed
- the working tree has uncommitted changes and `--allow-dirty` was not passed
- the approved plan is missing or invalid
- the plan lists a path that resolves outside the repository
- the plan retires a protected path
- the selected harness root is ambiguous and no root was supplied

Warnings are not gates. A stale generated directory, a missing optional
document, or an uncovered source area is a warning to surface to the user.

## Protected paths

The skill never retires these paths, even when a plan lists them:

- `README.md`, `LICENSE`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `AGENTS.md`,
  `CLAUDE.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `.gitignore`, and changelog
  files
- package manifests, lockfiles, and build configuration such as `package.json`,
  `pyproject.toml`, `Cargo.toml`, `Makefile`, `Dockerfile`, and `tsconfig.json`
- `docs/SUPPORT.md`
- `docs/adr/`, `docs/research/`, and `docs/releases/`
- source directories detected by the inventory
- test directories detected by the inventory
- CI workflows under `.github/workflows/`
- `.handoff/`, `.handoff-archive/`, and the installed handoff skill itself

A protected file inside a directory blocks retiring that whole directory.
Retire the surrounding files individually and leave the protected path in place.

## Deletion rules

- Apply only the paths in `.handoff/plan.json`.
- Never infer a deletion from a filename, a directory name, or document text.
- Never delete a path outside the repository.
- A `--keep` entry wins over the plan.
- Refuse to retire a directory when `--keep` selects a descendant; retire the
  remaining files individually instead.
- The default is archive. `--delete` is the explicit opt-in for removal.
- `--allow-no-git` forces archive mode because there is no history to recover
  from.

## Archive mode

Archive each retired path to `.handoff-archive/<timestamp>/` and write
`HANDOFF-MANIFEST.json` beside it with the plan mode, harness root, retired
paths, and preserved documents.

Use archive mode when:

- the user has not asked for irreversible removal
- the repository contains human-review evidence that is being retired
- the project is subject to a retention policy
- the repository has no git history

The archive is generated state, not project documentation. Add it to `.gitignore`
and do not count it as a handoff artifact.

## Git hygiene

- Prefer a clean tree so `git diff` and `git restore` remain meaningful.
- Do not commit inside the inventory or apply steps.
- Commit exactly once, after verification, only when `--commit` was explicitly
  requested.
- Never rewrite history or force-push.
- Report the diff and the verification command even when the caller asks for a
  commit.

## Headless contract

When the caller runs without interaction:

- read the approved plan; do not infer a retirement set
- stop on a blocking preflight failure
- make conservative choices for ambiguous documents and report them
- run verification before reporting success
- never commit unless `--commit` is present

## Skill lifecycle

This skill is a reusable migration tool. It does not delete itself, its own
scripts, or its installed directory. Leaving the skill in place is the correct
outcome; remove it later only if the user explicitly asks.
