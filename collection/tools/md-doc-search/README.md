# md-doc-search

This is a standalone Node.js CLI, not an assistant skill. It installs repository-local incremental Markdown search for coding agents: a Python SQLite FTS5 indexer and stdio MCP server, a managed lookup rule in `AGENTS.md`, a repo-level `.mcp.json` entry, and an ignore rule for the generated database.

## Requirements

- Node.js 18 or newer to install and run the CLI.
- Python 3.10 or newer for the installed indexer and MCP server.
- A Python SQLite build with FTS5 enabled. `doctor` checks FTS5 availability, and indexing reports a clear error if it is missing.
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

The managed `AGENTS.md` lookup rule uses section search for large reference documents. It explicitly preserves normal instruction loading for files such as `AGENTS.md`, `SKILL.md`, and custom agent definitions; search results are not a substitute for their full applicable instructions.

The generated `.mcp.json` uses the common `mcpServers` shape and an absolute script path so the server can start regardless of the MCP client's working directory. MCP clients do not share one universal configuration discovery convention: some require manual registration or a client-specific config. The absolute path is local to the checkout; regenerate or adapt the entry after moving/cloning the repository. See [MCP client configuration](docs/mcp-config.md) for adaptation guidance.

## Search and Manage the Index

The operational commands default to the current directory; use `--repo` to select another repository. For example:

```bash
md-doc-search doctor --repo /path/to/repository
md-doc-search status --repo /path/to/repository
md-doc-search inspect --repo /path/to/repository
md-doc-search inspect --file docs/deployment.md --repo /path/to/repository
md-doc-search search "deployment configuration" --repo /path/to/repository
md-doc-search read docs/deployment.md --start-line 12 --end-line 40 --repo /path/to/repository
md-doc-search index --repo /path/to/repository --force
```

`search` synchronizes changed files before returning ranked sections. `status` also synchronizes, then reports indexed Markdown documents, sections, and changes made during that sync; it may create or update `.docs_index.sqlite`. `inspect` synchronizes and lists indexed file paths, sizes, modification times, and section headings with line ranges; use `--file` to narrow it to one repository-relative path. `index` syncs incrementally unless `--force` is passed. `doctor` checks setup and runtime requirements without indexing. `read` prints a repository-relative Markdown range and caps output at 250 lines.

Pass `--json` to get machine-readable output from operational commands. Pass `--python <executable>` to select a Python interpreter, such as one from a virtual environment. `doctor` accepts `--mcp-config <path>` when setup used a non-default MCP config path.

The generated index lives at the repository root in `.docs_index.sqlite`. Its metadata scan compares `mtime_ns` and file size, so it cannot detect an edit that preserves both values. Use `md-doc-search index --repo /path/to/repository --force` to rebuild after such edits.

The Python scripts can also be run directly from the target repository:

```bash
python3 scripts/md_index.py index --dir .
python3 scripts/md_index.py search "deployment configuration"
```

For FTS5 errors, setup conflicts, or stale results, see [troubleshooting](docs/troubleshooting.md).

## Development

Run the Node.js CLI tests and Python indexer/MCP tests from this directory:

```bash
npm test
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The npm CLI has no runtime dependencies. The Python server and indexer use only the standard library and SQLite FTS5.
