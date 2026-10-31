# mcfuzzy-skills

A personal collection of reusable AI assistant skills that I find valuable in day-to-day work. Each skill captures a repeatable workflow, its constraints, useful reference material, and practical validation steps.

The repository is both a library and a workshop: skills can be used in other projects, refined as real work exposes edge cases, and reviewed against the [agentskills.io best practices](https://agentskills.io/skill-creation/best-practices).

## What Is Here

| Area | Purpose |
|------|---------|
| [`collection/skills/`](collection/skills/) | The reusable skill collection. Each skill is self-contained and can be copied into an assistant skill directory. |
| [`.agents/skills/`](.agents/skills/) | Local development and testing copies of skills used while working on this repository. |
| [`docs/`](docs/) | Repository-level audits and supporting documentation. |
| [`CHANGELOG.md`](CHANGELOG.md) | Notable additions and changes to the skill collection. |

## Skills

| Skill | What it does |
|-------|--------------|
| [`add-cross-platform-guidance`](collection/skills/add-cross-platform-guidance/README.md) | Installs Linux, macOS, and Windows rules in `AGENTS.md`, or creates it, and audits OS assumptions. |
| [`agent-meeting-minutes`](collection/skills/agent-meeting-minutes/SKILL.md) | Turns a transcript or chat into structured minutes: decisions, action items, open questions, and a summary. |
| [`maintenance-handover`](collection/skills/maintenance-handover/README.md) | Hands a completed build's agents and skills over to a repository-derived maintenance team, with optional explicit retirement of build artifacts. |
| [`create-project-documentation`](collection/skills/create-project-documentation/SKILL.md) | Creates or refreshes a project documentation suite: README, ADRs, user and admin guides, changelog, and release notes. |
| [`create-readme`](collection/skills/create-readme/SKILL.md) | Creates a concise, structured README for a project. |
| [`doc-map`](collection/skills/doc-map/README.md) | Builds a user-approved document map and adds maintenance instructions to `AGENTS.md`. |
| [`repo-story-time`](collection/skills/repo-story-time/README.md) | Tells a repository's story from its structure and Git history, with evidence-backed narrative. |
| [`skill-creator`](collection/skills/skill-creator/SKILL.md) | Interviews you and scaffolds a new skill, validated against the skill-review rubric. |
| [`skill-review`](collection/skills/skill-review/README.md) | Audits skills against agentskills.io best practices and scores six quality axes. |
| [`skill-review-updater`](collection/skills/skill-review-updater/SKILL.md) | Compares current best practices with the skill-review rubric and proposes prioritized updates. |

See each skill's `README.md` or `SKILL.md` for activation guidance, inputs, workflow, and validation. Some skills ship helper scripts and list their runtime requirements there.

## Using A Skill

Copy the skill directory into the skill location used by your assistant. For example:

```bash
cp -r collection/skills/create-readme .agents/skills/
```

The exact destination depends on the assistant or tooling in use. Keep the skill directory name unchanged so its frontmatter and activation behavior remain aligned.

## Developing A Skill

1. Start with a focused workflow and an unambiguous activation description.
2. Keep operational instructions in `SKILL.md` and move conditional detail into `references/`.
3. Document concrete gotchas, defaults, escape hatches, and validation steps.
4. Exercise the skill against a real repository or representative request.
5. Run the [`skill-review`](collection/skills/skill-review/SKILL.md) audit before treating the skill as ready to reuse.

For the portable skill-review package, see [`collection/skills/skill-review/`](collection/skills/skill-review/). Its embedded audit command can be run with Node.js 18+; Node.js 20+ is recommended.

## Repository Conventions

- Prefer focused, reusable skills over one large skill with unrelated workflows.
- Keep the shared collection vendor-neutral; project-specific workflows belong in that project's repository.
- Keep examples and references close to the skill that uses them.
- Treat generated or packaged copies as outputs that should be refreshed from their source skill.
- Record meaningful additions and behavior changes in [`CHANGELOG.md`](CHANGELOG.md).

## License

[MIT](LICENSE)
