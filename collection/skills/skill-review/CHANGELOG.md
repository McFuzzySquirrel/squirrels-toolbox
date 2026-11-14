# Changelog

All notable changes to `skill-review` will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Version numbers follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- **Eval file contract** (`SKILL.md` and portable template): `evals/evals.json` now has a documented shape — `skill` plus `cases[]` with `id`, `kind`, `prompt`, and `assertions`. `kind` accepts only `happy-path` and `edge-case`, and behavior-heavy skills need at least one of each, so the "an edge case" requirement is visible in the file rather than implied by prose.
- **Recorded exemptions**: the guidance now says to write `Eval exemption: {reason}` in the skill's own `## Validation` section. The previous wording required "an explicit exemption" without specifying where to put one, so in practice no exemption was ever recorded.

### Changed

- **Expanded metadata and activation checks** (`rubric.ts`): validate Agent Skills name constraints, the 1024-character description limit, and task/activation wording instead of only checking parent-directory equality and minimum description length.
- **Updated review guidance** (`SKILL.md` and portable template): added non-interactive script requirements, structured-output guidance, behavior-heavy skill eval expectations with informational-skill exemptions, and a self-validation checklist.
- **Split the bundled architecture ADR into one record per decision** (`docs/adr/`). `0001-skill-review-architecture.md` covered six decisions in a single file, which left it with no meaningful status and no way to supersede any one decision. It is replaced by `0001-static-heuristic-scoring.md`, `0002-six-scoring-axes.md`, `0003-modular-provider-pattern.md`, `0004-typescript-tsx-no-compile-step.md`, `0005-portable-standalone-skill-package.md`, and `0006-on-disk-folder-presence-scoring.md`, all keeping the original 2026-07-22 date and Accepted status.
- **Added `docs/architecture.md` and `docs/adr/index.md`.** The `System Architecture: Two-Layer Review` section, its Mermaid diagram, and the layer comparison table moved out of the ADR, because they describe the system rather than a decision. The new index lists every record. The README file-layout tree and Architecture section were updated to match.
- Negative-consequence bullets in records 0002, 0003, 0004, and 0006 are marked as inferred, because the original record stated no downside for those decisions. Review and confirm or cut them.

### Fixed

- **False-positive nested reference chain warning** (`rubric.ts`): the structural check matched `references/[^)]+\.md.*references/[^)]+\.md`, and `[^)]` also matches newlines. Any skill without a `)` character that mentioned a document and loaded a reference on the same line was reported as chaining, even though nothing chained. The check is now evaluated per line and only fires when a single line names two distinct reference paths. A regression test in `rubric.test.ts` covers both the clean and flagged cases.

---

## [1.1.0] - 2026-07-22

### Fixed

- **References folder detection** (`rubric.ts`): `hasRefsDir`, `hasAssetsDir`, and `hasScriptsDir` were passed into `AuditInput` but never forwarded to the scoring or suggestion functions — on-disk folder presence was silently ignored. All three flags are now passed through correctly.
- **Progressive disclosure scoring**: a skill with an existing `references/` or `assets/` directory on disk now scores ≥ 2, even if the folder is not yet linked in `SKILL.md`. Previously it would score 1 and receive a misleading "Create a references/ directory" suggestion.
- **Validation scoring**: a `scripts/` directory present on disk now counts the same as a `scripts/` reference in `SKILL.md` when computing the validation score.
- **Misleading suggestion text**: when a `references/` or `assets/` directory already exists on disk and the progressive disclosure score is 1, the suggestion now reads "Link your existing `references/` files in `SKILL.md` and add load triggers" instead of "Create a `references/` directory".

### Added

- **`--skills-dir` / `-d` CLI flag** (`skill-review.ts`): scan a specific root folder for `SKILL.md` files, overriding the standard auto-detection paths (`.agents/skills/`, `skills/`, etc.). Useful when skills are stored in a custom or non-standard location.

### Documentation

- Added comprehensive `README.md` with full installation guide, CLI reference table, auto-detection logic explanation, providers table, troubleshooting section, and architecture pointer.
- Added `docs/adr/0001-skill-review-architecture.md` — Architecture Decision Record covering static heuristics vs LLM scoring, the six-axis rubric design, the modular provider pattern, TypeScript + tsx runtime choice, portable skill package design, and on-disk folder detection rationale.
- Added `CHANGELOG.md` (this file).

---

## [1.0.0] - 2026-07-18

### Added

- Initial release of `skill-review`.
- Six-axis rubric scoring each skill 1–3 on: Context economy, Gotchas coverage, Procedural clarity, Progressive disclosure, Calibration, Validation.
- `scripts/rubric.ts` — heuristic scoring engine and Markdown report formatter.
- `scripts/skill-review.ts` — CLI entry point with `--provider`, `--files`, `--min-score`, `--fail-below`, and `--root` flags.
- `scripts/detect.ts` — skill file discovery, git diff–based change detection, and path validation helpers.
- Modular provider pattern with implementations for GitHub (`github.ts`), GitLab (`gitlab.ts`), Azure DevOps (`ado.ts`), and stdout (`stdout.ts`).
- CI example workflows for GitHub Actions (`ci-examples/github-actions.yml`) and Azure DevOps (`ci-examples/azure-pipelines.yml`).
- Portable standalone skill package at `templates/skills/skill-review/` — a self-contained directory with `SKILL.md`, embedded scripts, and `package.json` that can be dropped into any project's skill directory.
- TypeScript throughout; validated with `npm run typecheck` (`tsc --noEmit`).

[Unreleased]: https://github.com/McFuzzySquirrel/experimental-skills/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/McFuzzySquirrel/experimental-skills/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/McFuzzySquirrel/experimental-skills/releases/tag/v1.0.0
