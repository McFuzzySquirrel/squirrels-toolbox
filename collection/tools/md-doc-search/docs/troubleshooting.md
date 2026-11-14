# Troubleshooting

Use this guide when indexing fails, setup reports a conflict, or search results may be stale.

## SQLite does not provide FTS5

Run the index command from the target repository:

```bash
python3 scripts/md_index.py index --dir .
```

If it reports that FTS5 is unavailable, use Python 3.10+ linked to SQLite with FTS5 enabled, then rerun the command. Node.js runs the installer; the target indexer and MCP server still run under Python. Do not report the MCP tools as ready until indexing succeeds.

## Setup reports a conflict

The installer refuses to overwrite a script it does not recognize or an existing `md-doc-search` MCP entry. Inspect the reported path and preserve or back up user data before deciding whether to rerun with `--force`. Invalid `.mcp.json` content and incomplete `md-doc-search` markers in `AGENTS.md` must be repaired manually; force does not replace those files.

## Search returns no matches or stale results

- Confirm the target `.md` files are below the repository root and not inside `.git`, `node_modules`, `.venv`, `venv`, `__pycache__`, `dist`, or `build`.
- Run `python3 scripts/md_index.py index --dir .` and inspect its updated/removed counts.
- If an edit preserved both file size and `mtime_ns`, incremental metadata comparison cannot detect it. Run `python3 scripts/md_index.py index --dir . --force`.
- If an FTS5 expression is malformed, the indexer retries using quoted word terms. If the retry still fails, report the error rather than treating it as an empty result.

## MCP client does not list the tools

Check that the client reads the generated `.mcp.json` convention. If not, translate the `mcpServers` entry using the selected client's current docs, restart/reload the client, and verify both tool names. Keep the script path absolute unless the client explicitly supports a repository working-directory field.
