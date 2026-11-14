#!/usr/bin/env python3
"""Incrementally index repository Markdown sections with SQLite FTS5."""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
import sys
from pathlib import Path

DB_NAME = ".docs_index.sqlite"
IGNORE_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build"}
HEADING_RE = re.compile(r"^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$")
FENCE_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
CLOSE_FENCE_RE = re.compile(r"^ {0,3}(`+|~+)[ \t]*$")
WORD_RE = re.compile(r"\w+", re.UNICODE)


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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Incremental SQLite FTS5 Markdown indexer")
    subparsers = parser.add_subparsers(dest="command", required=True)
    index_parser = subparsers.add_parser("index", help="Sync or rebuild the Markdown index")
    index_parser.add_argument("--dir", type=Path, default=Path.cwd(), help="Root directory to scan")
    index_parser.add_argument("--force", action="store_true", help="Rebuild the index from scratch")
    search_parser = subparsers.add_parser("search", help="Auto-sync and search Markdown sections")
    search_parser.add_argument("query", help="Keywords or FTS5 expression")
    search_parser.add_argument("-k", type=int, default=5, help="Maximum results")
    search_parser.add_argument("--dir", type=Path, default=Path.cwd(), help="Root directory to search")
    args = parser.parse_args(argv)

    try:
        if args.command == "index":
            changed, deleted = sync_index(args.dir, force=args.force)
            print(f"Synced index: {changed} updated, {deleted} removed.")
        else:
            rows = search_index(args.query, max(1, args.k), args.dir)
            if not rows:
                print("No matching sections found.")
            for file_path, heading, start, end, snippet in rows:
                print(f"FILE: {file_path} (lines {start}-{end})")
                print(f"SECTION: {heading}")
                print(f"SNIPPET: {snippet.replace(chr(10), ' ')}\n")
    except (OSError, sqlite3.Error, RuntimeError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
