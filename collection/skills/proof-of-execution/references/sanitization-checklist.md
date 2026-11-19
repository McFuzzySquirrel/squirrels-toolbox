# Sanitization Checklist

Apply to a copy of the raw record before it becomes a sidecar. Show the user every redaction and get approval.

## Redact

- Secrets: API keys, tokens, passwords, private keys, connection strings, `Authorization` headers. Search for `key`, `token`, `secret`, `password`, `Bearer`, `BEGIN .* PRIVATE`.
- Personal data: emails, usernames, real names, phone numbers, IP addresses.
- Environment details: absolute home paths (`/home/alice/...` becomes `~/...`), hostnames, internal URLs, org or customer names.
- Quoted file or command output that includes any of the above.

## Keep

- Step order, statuses, exit codes, relative paths, file sizes and hashes, and verdicts. These are the evidence.

## Rules

- Replace with a typed placeholder such as `<REDACTED:token>` so the record stays readable.
- If redaction removes the evidence for a claim, mark that claim `unverified` rather than deleting the row.
- Add a line `Sanitized: yes, N redactions` under the header.
- Re-scan the final text for the patterns above. If unsure whether something is sensitive, redact it or ask.
- Hashes in frontmatter (`po-record-sha256`) refer to the raw record, not the sanitized copy.
