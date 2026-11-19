# proof-of-execution

Get evidence that a skill actually does what it claims. Po ("proof of") temporarily adds a record-keeping step to a skill, captures what happened in a real run, and, once you confirm the record, removes the step and tags the skill as verified.

[Explore the Proof of Execution workflow diagram](../../../.archify/workflow-proof-of-execution-20261119-224839/proof-of-execution.html).

- Works on any skill you wrote or are evaluating
- Records stay outside the repository by default, because they may hold sensitive data
- Optional sanitized sidecar record next to the skill, only with your approval
- Instructions only: no scripts or dependencies

---

## How it works

1. **Preflight**: confirms the skill's git state is clean and hashes `SKILL.md`.
2. **Instrument**: appends a `PO:BEGIN` / `PO:END` step to the end of the skill.
3. **Run**: the skill runs on a real task you choose.
4. **Record**: the agent writes an evidence record to `~/.po/records/<skill>/<timestamp>.md`.
5. **Review**: you check the record, optionally approve a sanitized copy, and answer `confirm` or `reject`.
6. **Finalize**: the Po step is always removed and the file verified identical to the original. On `confirm`, frontmatter gains:

   ```yaml
   metadata:
     po-verified: "YYYY-MM-DD"
     po-record-sha256: "<hash of the raw record>"
     po-skill-sha256: "<hash of SKILL.md before tagging>"
   ```

## Usage

Ask your agent, for example:

> Run proof of execution on `collection/skills/create-readme` using this sample project.

Provide the target skill path and a representative task; the skill asks for anything missing.

## What the tag means

A `po-verified` tag means a human confirmed one recorded run. It does not prove the skill is correct in general. Editing `SKILL.md` afterward makes the tag stale: remove the `po-*` metadata lines, rehash, and compare with `po-skill-sha256`; a mismatch means re-run Po.

## File layout

```
proof-of-execution/
├── SKILL.md
├── README.md
├── evals/evals.json
└── references/
    ├── po-step-snippet.md        # block appended during the run
    ├── record-template.md        # evidence record format
    └── sanitization-checklist.md # redaction rules for sidecars
```

## Troubleshooting

- **Po block left in a skill after an abort**: run `git checkout -- <skill-dir>/SKILL.md`, or restore the `.bak` copy made for non-git skills.
- **Preflight refuses to start**: the skill directory has uncommitted changes; commit or stash them first.
- **Record contains secrets**: never move it into the repo; use the sanitization checklist for a sidecar.
