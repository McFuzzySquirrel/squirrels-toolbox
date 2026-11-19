# Po Record Template

```markdown
# Proof of Execution: <skill-name>

- Skill path: <path>
- Skill SHA-256 (before instrumentation): <original-sha256>
- Run date (UTC): <timestamp>
- Agent / model: <name if known>
- Task given: <the real task the skill was run on>

## Claimed intent
<quoted from the skill's description and expected outcomes>

## Steps
| # | Skill step | Status (done / skipped / modified) | Evidence |
|---|------------|-----------------------------------|----------|

## Commands run
| Command | Exit code | Notable output (quoted) |
|---------|-----------|-------------------------|

## Artifacts
| Path | Created / changed | Size or SHA-256 |
|------|-------------------|-----------------|

## Outcome vs. intent
| Expected outcome | Observed | Verdict (met / partly / not met / unverified) |
|------------------|----------|-----------------------------------------------|

## Deviations and errors
<anything skipped, retried, improvised, or failed; "none" only if true>

## Limits of this record
<scenario exercised, what was not tested, anything unverified>

## User verdict
- Verdict: <confirm | reject>
- Confirmed by: <user>, <date>
```
