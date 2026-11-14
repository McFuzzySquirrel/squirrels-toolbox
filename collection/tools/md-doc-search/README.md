# md-doc-search

This is a standalone Node.js CLI, not an assistant skill. It installs repository-local incremental Markdown search for coding agents: a Python SQLite FTS5 indexer and stdio MCP server, a managed lookup rule in `AGENTS.md`, a repo-level `.mcp.json` entry, and an ignore rule for the generated database.

## Requirements

- Node.js 18 or newer to install and run the CLI.
- Python 3.10 or newer for the installed indexer and MCP server.
- A Python SQLite build with FTS5 enabled. The index command reports a clear error if FTS5 is missing.
- No npm runtime dependencies; the target repo still needs Python for the MCP server and indexer.

## Install the CLI

Until the package is published, install directly from a local checkout; this does not require the npm registry. From the toolbox repository root, run:

```bash
npm install --global ./collection/tools/md-doc-search
```

Or, from this package directory:

```bash
npm install --global .
```

After the package is published to npm, users can install it by name or invoke it with `npx`:

```bash
npm install --global md-doc-search
npx --yes md-doc-search init --repo /path/to/repository
```

## Set Up a Repository

Preview first; the command does not write unless `--apply` is passed:

```bash
md-doc-search init --repo /path/to/repository
md-doc-search init --repo /path/to/repository --apply
```

Omit `--repo` to target the current directory. The CLI creates or updates:

| Path | Purpose |
|---|---|
| `scripts/md_index.py` | Incremental SQLite FTS5 indexer and optional direct search CLI |
| `scripts/md_mcp_server.py` | MCP stdio server exposing `search_docs` and `read_doc_section` |
| `.mcp.json` | Generic `mcpServers` entry for the local server |
| `AGENTS.md` | Delimited documentation lookup rule; unrelated text is preserved |
| `.gitignore` | Root ignore entry for `/.docs_index.sqlite` |

Use `--mcp-config <repo-relative-path>` to write the generic MCP entry elsewhere. Use `--force` only after reviewing a conflict; it replaces mismatched installed scripts or the `md-doc-search` server entry, but does not replace malformed JSON or repair incomplete AGENTS markers.

The generated `.mcp.json` uses the common `mcpServers` shape and an absolute script path so the server can start regardless of the MCP client's working directory. MCP clients do not share one universal configuration discovery convention: some require manual registration or a client-specific config. The absolute path is local to the checkout; regenerate or adapt the entry after moving/cloning the repository. See [MCP client configuration](docs/mcp-config.md) for adaptation guidance.

## Validate and Use the Index

From the target repository:

```bash
python3 scripts/md_index.py index --dir .
python3 scripts/md_index.py search "deployment configuration"
```

The server synchronizes Markdown metadata before each search and returns section line ranges. The generated index lives at the repository root in `.docs_index.sqlite`.

The metadata scan compares `mtime_ns` and file size. It avoids re-reading unchanged files, but cannot detect a same-size edit that preserves its modification timestamp. Use `python3 scripts/md_index.py index --dir . --force` to rebuild after such edits.

For FTS5 errors, setup conflicts, or stale results, see [troubleshooting](docs/troubleshooting.md).

## Development

Run the Node.js CLI tests and Python indexer/MCP tests from this directory:

```bash
npm test
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The npm CLI has no runtime dependencies. The Python server and indexer use only the standard library and SQLite FTS5.
