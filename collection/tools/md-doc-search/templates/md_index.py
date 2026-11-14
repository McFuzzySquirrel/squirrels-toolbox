#!/usr/bin/env python3
"""Incrementally index repository Markdown sections with SQLite FTS5."""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any, TypedDict

DB_NAME = ".docs_index.sqlite"
IGNORE_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build"}
HEADING_RE = re.compile(r"^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$")
FENCE_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
CLOSE_FENCE_RE = re.compile(r"^ {0,3}(`+|~+)[ \t]*$")
WORD_RE = re.compile(r"\w+", re.UNICODE)


class DocSection(TypedDict):
    file_path: str
    start_line: int
    end_line: int
    total_lines: int
    lines: list[str]


def require_supported_python() -> None:
    if sys.version_info < (3, 10):
        raise RuntimeError("md-doc-search requires Python 3.10 or newer.")


def parse_markdown_sections(file_path: Path, relative_path: str | None = None) -> list[tuple[str, str, int, int, str]]:
    """Split a Markdown file into heading sections without treating fenced code as headings."""
    lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
    path_value = relative_path or file_path.as_posix()
    sections: list[tuple[str, str, int, int, str]] = []
    heading_stack: list[tuple[int, str]] = []
    current_start = 1
    current_lines: list[str] = []
    fence_char: str | None = None
    fence_length = 0

    def flush(end_line: int) -> None:
        body = "\n".join(current_lines).strip()
        if body or heading_stack:
            heading_path = " > ".join(title for _, title in heading_stack) or "(Document Top)"
            sections.append((path_value, heading_path, current_start, end_line, body))

    for line_number, line in enumerate(lines, start=1):
        if fence_char is not None:
            close_match = CLOSE_FENCE_RE.match(line)
            if close_match:
                marker = close_match.group(1)
                if marker[0] == fence_char and len(marker) >= fence_length:
                    fence_char = None
                    fence_length = 0
            current_lines.append(line)
            continue

        opening_match = FENCE_RE.match(line)
        if opening_match:
            marker = opening_match.group(1)
            fence_char = marker[0]
            fence_length = len(marker)
            current_lines.append(line)
            continue

        heading_match = HEADING_RE.match(line)
        if heading_match:
            flush(line_number - 1)
            level = len(heading_match.group(1))
            title = re.sub(r"[ \t]+#+[ \t]*$", "", heading_match.group(2)).strip()
            while heading_stack and heading_stack[-1][0] >= level:
                heading_stack.pop()
            heading_stack.append((level, title))
            current_start = line_number
            current_lines = [line]
        else:
            current_lines.append(line)

    flush(len(lines))
    return sections


def init_db(conn: sqlite3.Connection) -> None:
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS files (
                file_path TEXT PRIMARY KEY,
                mtime_ns INTEGER NOT NULL,
                size INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sections (
                id INTEGER PRIMARY KEY,
                file_path TEXT NOT NULL,
                heading_path TEXT NOT NULL,
                start_line INTEGER NOT NULL,
                end_line INTEGER NOT NULL,
                content TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS sections_file_path_idx ON sections(file_path);
            CREATE VIRTUAL TABLE IF NOT EXISTS sections_fts USING fts5(
                heading_path,
                content,
                tokenize='porter unicode61'
            );
            """
        )
    except sqlite3.OperationalError as exc:
        if "fts5" in str(exc).lower() or "no such module" in str(exc).lower():
            raise RuntimeError("This Python SQLite build does not provide FTS5, which md-doc-search requires.") from exc
        raise


def _markdown_files(root_dir: Path) -> dict[str, tuple[int, int]]:
    current: dict[str, tuple[int, int]] = {}
    for directory, subdirectories, filenames in os.walk(root_dir, followlinks=False):
        subdirectories[:] = [
            name for name in subdirectories
            if name not in IGNORE_DIRS and not (Path(directory) / name).is_symlink()
        ]
        for filename in filenames:
            if not filename.endswith(".md"):
                continue
            file_path = Path(directory) / filename
            if file_path.is_symlink():
                continue
            stat = file_path.stat()
            current[file_path.relative_to(root_dir).as_posix()] = (stat.st_mtime_ns, stat.st_size)
    return current


def _delete_file_sections(cur: sqlite3.Cursor, file_path: str) -> None:
    rowids = [row[0] for row in cur.execute("SELECT id FROM sections WHERE file_path = ?", (file_path,))]
    for rowid in rowids:
        cur.execute("DELETE FROM sections_fts WHERE rowid = ?", (rowid,))
    cur.execute("DELETE FROM sections WHERE file_path = ?", (file_path,))


def sync_index(root_dir: Path = Path("."), force: bool = False) -> tuple[int, int]:
    """Update changed files using mtime/size metadata; metadata-preserving edits are not detectable."""
    require_supported_python()
    root = root_dir.expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f"Markdown index root is not a directory: {root}")

    current_files = _markdown_files(root)
    db_path = root / DB_NAME
    if db_path.is_symlink():
        raise ValueError(f"Refusing to write Markdown index through a symlink: {db_path}")
    conn = sqlite3.connect(db_path)
    try:
        init_db(conn)
        cur = conn.cursor()
        indexed_files = {
            file_path: (mtime_ns, size)
            for file_path, mtime_ns, size in cur.execute("SELECT file_path, mtime_ns, size FROM files")
        }

        if force:
            changed = list(current_files)
            deleted = []
        else:
            deleted = [file_path for file_path in indexed_files if file_path not in current_files]
            changed = [
                file_path
                for file_path, metadata in current_files.items()
                if indexed_files.get(file_path) != metadata
            ]

        if not force and not deleted and not changed:
            return 0, 0

        with conn:
            if force:
                cur.execute("DELETE FROM sections_fts")
                cur.execute("DELETE FROM sections")
                cur.execute("DELETE FROM files")
            else:
                for file_path in deleted:
                    _delete_file_sections(cur, file_path)
                    cur.execute("DELETE FROM files WHERE file_path = ?", (file_path,))

            for file_path in changed:
                if not force:
                    _delete_file_sections(cur, file_path)
                rows = parse_markdown_sections(root / file_path, file_path)
                for indexed_path, heading_path, start, end, content in rows:
                    cur.execute(
                        """
                        INSERT INTO sections (file_path, heading_path, start_line, end_line, content)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (indexed_path, heading_path, start, end, content),
                    )
                    section_id = cur.lastrowid
                    cur.execute(
                        "INSERT INTO sections_fts (rowid, heading_path, content) VALUES (?, ?, ?)",
                        (section_id, heading_path, content),
                    )
                mtime_ns, size = current_files[file_path]
                cur.execute(
                    "INSERT OR REPLACE INTO files (file_path, mtime_ns, size) VALUES (?, ?, ?)",
                    (file_path, mtime_ns, size),
                )
        return len(changed), len(deleted)
    finally:
        conn.close()


def search_index(query: str, limit: int = 5, root_dir: Path = Path(".")) -> list[tuple[str, str, int, int, str]]:
    """Synchronize and return ranked Markdown sections matching an FTS5 query."""
    root = root_dir.expanduser().resolve()
    sync_index(root)
    safe_query = " ".join(f'"{word}"' for word in WORD_RE.findall(query))
    if not query.strip() or limit <= 0:
        return []

    sql = """
        SELECT s.file_path, s.heading_path, s.start_line, s.end_line,
               snippet(sections_fts, 1, '[', ']', '...', 24)
        FROM sections_fts
        JOIN sections s ON sections_fts.rowid = s.id
        WHERE sections_fts MATCH ?
        ORDER BY bm25(sections_fts, 5.0, 1.0)
        LIMIT ?
    """
    conn = sqlite3.connect(root / DB_NAME)
    try:
        try:
            return conn.execute(sql, (query, limit)).fetchall()
        except sqlite3.OperationalError as exc:
            if not safe_query or not any(
                token in str(exc).lower() for token in ("fts5", "syntax", "malformed", "unterminated")
            ):
                raise
            return conn.execute(sql, (safe_query, limit)).fetchall()
    finally:
        conn.close()


def index_status(root_dir: Path = Path(".")) -> dict[str, int | str | bool]:
    root = root_dir.expanduser().resolve()
    db_path = root / DB_NAME
    initialized = db_path.exists()
    changed, removed = sync_index(root)
    conn = sqlite3.connect(db_path)
    try:
        documents = conn.execute("SELECT COUNT(*) FROM files").fetchone()[0]
        sections = conn.execute("SELECT COUNT(*) FROM sections").fetchone()[0]
    finally:
        conn.close()
    return {
        "database_path": str(db_path),
        "documents": documents,
        "sections": sections,
        "changed": changed,
        "removed": removed,
        "initialized": not initialized,
    }


def read_doc_section(
    file_path: str,
    start_line: int,
    end_line: int,
    root_dir: Path = Path("."),
) -> DocSection:
    if not isinstance(file_path, str) or not file_path:
        raise ValueError("file_path must be a non-empty string")
    if any(isinstance(value, bool) or not isinstance(value, int) for value in (start_line, end_line)):
        raise ValueError("start_line and end_line must be integers")
    if start_line < 1 or end_line < start_line:
        raise ValueError("line range must start at 1 or later and end at or after the start")
    if Path(file_path).is_absolute():
        raise ValueError("file_path must be repository-relative")

    root = root_dir.expanduser().resolve()
    target = (root / file_path).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"Invalid file path '{file_path}': path escapes the repository") from exc
    if target.suffix.lower() != ".md" or not target.is_file():
        raise ValueError(f"Invalid or missing Markdown file '{file_path}'")

    lines = target.read_text(encoding="utf-8", errors="replace").splitlines()
    if start_line > len(lines):
        raise ValueError(f"start_line {start_line} exceeds the file length ({len(lines)} lines)")
    end = min(len(lines), end_line, start_line + 249)
    return {
        "file_path": file_path,
        "start_line": start_line,
        "end_line": end,
        "total_lines": len(lines),
        "lines": lines[start_line - 1:end],
    }


def format_doc_section(section: DocSection) -> str:
    file_path = section["file_path"]
    start_line = section["start_line"]
    end_line = section["end_line"]
    total_lines = section["total_lines"]
    lines = section["lines"]
    numbered = [
        f"{number}: {line}"
        for number, line in enumerate(lines, start=start_line)
    ]
    return f"--- {file_path} (lines {start_line}-{end_line} of {total_lines}) ---\n" + "\n".join(numbered)


def doctor(root_dir: Path = Path("."), mcp_config: Path = Path(".mcp.json")) -> dict[str, Any]:
    root = root_dir.expanduser().resolve()
    checks: list[dict[str, str | bool]] = []

    version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    checks.append({
        "name": "Python version",
        "ok": sys.version_info >= (3, 10),
        "detail": version if sys.version_info >= (3, 10) else f"{version}; requires Python 3.10 or newer",
    })

    try:
        conn = sqlite3.connect(":memory:")
        try:
            conn.execute("CREATE VIRTUAL TABLE fts5_check USING fts5(value)")
        finally:
            conn.close()
        checks.append({"name": "SQLite FTS5", "ok": True, "detail": "available"})
    except sqlite3.Error as exc:
        checks.append({"name": "SQLite FTS5", "ok": False, "detail": str(exc)})

    indexer_path = root / "scripts" / "md_index.py"
    server_path = root / "scripts" / "md_mcp_server.py"
    checks.append({
        "name": "Indexer script",
        "ok": indexer_path.is_file(),
        "detail": str(indexer_path) if indexer_path.is_file() else "missing; run md-doc-search init --apply",
    })
    checks.append({
        "name": "MCP server script",
        "ok": server_path.is_file(),
        "detail": str(server_path) if server_path.is_file() else "missing; run md-doc-search init --apply",
    })

    requested_config = mcp_config.expanduser()
    config_path = requested_config.resolve() if requested_config.is_absolute() else (root / requested_config).resolve()
    try:
        config_path.relative_to(root)
    except ValueError:
        checks.append({"name": "MCP config", "ok": False, "detail": "config path is outside the repository"})
    else:
        try:
            config = json.loads(config_path.read_text(encoding="utf-8"))
            servers = config.get("mcpServers") if isinstance(config, dict) else None
            entry = servers.get("md-doc-search") if isinstance(servers, dict) else None
            expected_command = "python" if os.name == "nt" else "python3"
            expected_server = str(server_path.resolve())
            valid = (
                isinstance(entry, dict)
                and entry.get("command") == expected_command
                and entry.get("args") == [expected_server]
            )
            detail = "registered" if valid else "missing or does not match the installed MCP server"
            checks.append({"name": "MCP config", "ok": valid, "detail": detail})
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            checks.append({"name": "MCP config", "ok": False, "detail": str(exc)})

    database_path = root / DB_NAME
    return {
        "ok": all(check["ok"] for check in checks),
        "checks": checks,
        "database_path": str(database_path),
        "database_exists": database_path.is_file(),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Incremental SQLite FTS5 Markdown indexer")
    subparsers = parser.add_subparsers(dest="command", required=True)
    index_parser = subparsers.add_parser("index", help="Sync or rebuild the Markdown index")
    index_parser.add_argument("--dir", type=Path, default=Path.cwd(), help="Root directory to scan")
    index_parser.add_argument("--force", action="store_true", help="Rebuild the index from scratch")
    index_parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")
    search_parser = subparsers.add_parser("search", help="Auto-sync and search Markdown sections")
    search_parser.add_argument("query", help="Keywords or FTS5 expression")
    search_parser.add_argument("-k", type=int, default=5, help="Maximum results")
    search_parser.add_argument("--dir", type=Path, default=Path.cwd(), help="Root directory to search")
    search_parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")
    status_parser = subparsers.add_parser("status", help="Sync and report Markdown index state")
    status_parser.add_argument("--dir", type=Path, default=Path.cwd(), help="Root directory to inspect")
    status_parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")
    read_parser = subparsers.add_parser("read", help="Read a bounded Markdown line range")
    read_parser.add_argument("file_path", help="Repository-relative Markdown file")
    read_parser.add_argument("--start-line", required=True, type=int, help="1-based start line")
    read_parser.add_argument("--end-line", required=True, type=int, help="1-based end line")
    read_parser.add_argument("--dir", type=Path, default=Path.cwd(), help="Repository root")
    read_parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")
    doctor_parser = subparsers.add_parser("doctor", help="Check repository setup and runtime requirements")
    doctor_parser.add_argument("--dir", type=Path, default=Path.cwd(), help="Repository root")
    doctor_parser.add_argument("--mcp-config", type=Path, default=Path(".mcp.json"), help="MCP config path")
    doctor_parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")
    args = parser.parse_args(argv)

    try:
        if args.command == "index":
            changed, deleted = sync_index(args.dir, force=args.force)
            if args.json:
                print(json.dumps({"changed": changed, "removed": deleted, "forced": args.force}))
            else:
                print(f"Synced index: {changed} updated, {deleted} removed.")
        elif args.command == "search":
            rows = search_index(args.query, max(1, args.k), args.dir)
            if args.json:
                print(json.dumps({
                    "query": args.query,
                    "results": [
                        {
                            "file_path": file_path,
                            "heading_path": heading,
                            "start_line": start,
                            "end_line": end,
                            "snippet": snippet,
                        }
                        for file_path, heading, start, end, snippet in rows
                    ],
                }))
            elif not rows:
                print("No matching sections found.")
            else:
                for file_path, heading, start, end, snippet in rows:
                    print(f"FILE: {file_path} (lines {start}-{end})")
                    print(f"SECTION: {heading}")
                    print(f"SNIPPET: {snippet.replace(chr(10), ' ')}\n")
        elif args.command == "status":
            status = index_status(args.dir)
            if args.json:
                print(json.dumps(status))
            else:
                state = "Initialized index." if status["initialized"] else "Index is current."
                print(
                    f"{state} {status['documents']} Markdown documents, "
                    f"{status['sections']} sections; "
                    f"{status['changed']} changed, {status['removed']} removed."
                )
                print(f"Database: {status['database_path']}")
        elif args.command == "read":
            section = read_doc_section(args.file_path, args.start_line, args.end_line, args.dir)
            if args.json:
                print(json.dumps(section))
            else:
                print(format_doc_section(section))
        else:
            result = doctor(args.dir, args.mcp_config)
            if args.json:
                print(json.dumps(result))
            else:
                for check in result["checks"]:
                    state = "PASS" if check["ok"] else "FAIL"
                    print(f"{state}: {check['name']} - {check['detail']}")
                index_state = "present" if result["database_exists"] else "not created yet"
                print(f"Index: {index_state} ({result['database_path']})")
            if not result["ok"]:
                return 1
    except (OSError, sqlite3.Error, RuntimeError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
