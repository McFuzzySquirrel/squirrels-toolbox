#!/usr/bin/env python3
"""JSON-RPC stdio MCP server for repository Markdown search."""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from md_index import format_doc_section, read_doc_section, require_supported_python, search_index

ROOT_DIR = Path(__file__).resolve().parents[1]

TOOLS = [
    {
        "name": "search_docs",
        "description": (
            "Search Markdown documentation using BM25 ranking. Synchronizes changed files before each search "
            "and returns matching sections with paths, heading paths, snippets, and exact line ranges."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Keywords or an FTS5 query string"},
                "limit": {"type": "integer", "default": 5, "description": "Maximum sections to return (1-10)"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_doc_section",
        "description": "Read a bounded line range from a Markdown file returned by search_docs.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "Repository-relative path to a .md file"},
                "start_line": {"type": "integer", "description": "1-based start line"},
                "end_line": {"type": "integer", "description": "1-based end line"},
            },
            "required": ["file_path", "start_line", "end_line"],
        },
    },
]


def handle_search(query: str, limit: int = 5, root_dir: Path = ROOT_DIR) -> str:
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query must be a non-empty string")
    if isinstance(limit, bool) or not isinstance(limit, int):
        raise ValueError("limit must be an integer")
    bounded_limit = max(1, min(limit, 10))
    rows = search_index(query, bounded_limit, root_dir)
    if not rows:
        return "No matching sections found."

    return "\n\n".join(
        f"- **{heading}**\n"
        f"  File: `{file_path}` (lines {start}-{end})\n"
        f"  Snippet: {snippet.replace(chr(10), ' ')}"
        for file_path, heading, start, end, snippet in rows
    )


def handle_read_section(
    file_path: str,
    start_line: int,
    end_line: int,
    root_dir: Path = ROOT_DIR,
) -> str:
    section = read_doc_section(file_path, start_line, end_line, root_dir)
    return format_doc_section(section)


def process_request(request: dict[str, Any], root_dir: Path = ROOT_DIR) -> dict[str, Any] | None:
    request_id = request.get("id")
    method = request.get("method")
    params = request.get("params", {})

    if method == "notifications/initialized":
        return None
    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "md-doc-search", "version": "0.1.0"},
            },
        }
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": request_id, "result": {"tools": TOOLS}}
    if method == "tools/call":
        try:
            if not isinstance(params, dict):
                raise ValueError("params must be an object")
            name = params.get("name")
            arguments = params.get("arguments", {})
            if not isinstance(arguments, dict):
                raise ValueError("arguments must be an object")
            if name == "search_docs":
                text = handle_search(arguments.get("query"), arguments.get("limit", 5), root_dir)
            elif name == "read_doc_section":
                text = handle_read_section(
                    arguments.get("file_path"),
                    arguments.get("start_line"),
                    arguments.get("end_line"),
                    root_dir,
                )
            else:
                raise ValueError(f"Unknown tool: {name}")
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {"content": [{"type": "text", "text": text}]},
            }
        except (OSError, sqlite3.Error, RuntimeError, ValueError, TypeError) as exc:
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "content": [{"type": "text", "text": f"Error: {exc}"}],
                    "isError": True,
                },
            }
    if request_id is not None:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        }
    return None


def send(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def main() -> int:
    try:
        require_supported_python()
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            request = json.loads(raw)
        except json.JSONDecodeError as exc:
            send({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": f"Parse error: {exc.msg}"}})
            continue
        if not isinstance(request, dict):
            send({"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid request"}})
            continue
        response = process_request(request)
        if response is not None:
            send(response)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
