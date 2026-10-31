# mcfuzzy-skills

A personal collection of reusable AI assistant skills that I find valuable in day-to-day work. Each skill captures a repeatable workflow, its constraints, useful reference material, and practical validation steps.

The repository is both a library and a workshop: skills can be used in other projects, refined as real work exposes edge cases, and reviewed against the [agentskills.io best practices](https://agentskills.io/skill-creation/best-practices).

## What Is Here

| Area | Purpose |
|------|---------|
| [`collection/`](collection/) | The current collection of reusable skills. Each skill is self-contained and can be copied into an assistant skill directory. |
| [`.agents/skills/`](.agents/skills/) | Local development and testing copies of skills used while working on this repository. |
| [`docs/`](docs/) | Repository-level audits and supporting documentation. |
| [`CHANGELOG.md`](CHANGELOG.md) | Notable additions and changes to the skill collection. |

## Skills

The collection currently includes skills for:

- Creating and refining skills.
- Mapping any user-approved repository documentation independently from documentation creation.
- Reviewing skills against quality and packaging guidelines.
- Updating the skill-review process as best practices evolve.
- Creating or refreshing a defined project documentation suite without maintaining a separate document map.
- Converting a completed project's build agents and skills into a repository-derived maintenance team, with optional retirement of explicitly approved build artifacts.
- Creating README files.
- Turning conversations into structured meeting minutes.
- Installing cross-platform development rules into a repository's `AGENTS.md`.
- Telling the story of a repository from its structure and Git history.

See the individual `SKILL.md` files under [`collection/skills/`](collection/skills/) for activation guidance and workflow details.

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
5. Run the skill-review audit before treating the skill as ready to reuse.

For the portable skill-review package, see [`collection/skills/skill-review/`](collection/skills/skill-review/). Its embedded audit command can be run with Node.js 18+; Node.js 20+ is recommended.

## Repository Conventions

- Prefer focused, reusable skills over one large skill with unrelated workflows.
- Keep examples and references close to the skill that uses them.
- Treat generated or packaged copies as outputs that should be refreshed from their source skill.
- Record meaningful additions and behavior changes in [`CHANGELOG.md`](CHANGELOG.md).

## License

MIT
