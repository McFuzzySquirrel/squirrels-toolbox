from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

TEMPLATE_DIR = Path(__file__).parents[1] / "templates"
sys.path.insert(0, str(TEMPLATE_DIR))

import md_mcp_server


class MarkdownMcpServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        (self.root / "guide.md").write_text("# Getting Started\nInstall the blue widget.\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_only_search_and_read_tools_are_advertised(self) -> None:
        response = md_mcp_server.process_request({"id": 1, "method": "tools/list"}, self.root)
        names = [tool["name"] for tool in response["result"]["tools"]]
        self.assertEqual(names, ["search_docs", "read_doc_section"])

    def test_search_syncs_and_read_returns_bounded_numbered_lines(self) -> None:
        response = md_mcp_server.process_request(
            {
                "id": 2,
                "method": "tools/call",
                "params": {"name": "search_docs", "arguments": {"query": "blue widget", "limit": 99}},
            },
            self.root,
        )
        self.assertIn("guide.md", response["result"]["content"][0]["text"])
        self.assertTrue((self.root / ".docs_index.sqlite").is_file())

        read_response = md_mcp_server.process_request(
            {
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "read_doc_section",
                    "arguments": {"file_path": "guide.md", "start_line": 2, "end_line": 900},
                },
            },
            self.root,
        )
        self.assertEqual(
            read_response["result"]["content"][0]["text"],
            "--- guide.md (lines 2-2 of 2) ---\n2: Install the blue widget.",
        )

    def test_read_rejects_paths_outside_repository_and_invalid_ranges(self) -> None:
        with tempfile.TemporaryDirectory(dir=self.root.parent) as outside_directory:
            outside = Path(outside_directory) / "outside.md"
            outside.write_text("secret", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "escapes the repository"):
                md_mcp_server.handle_read_section(f"../{outside.parent.name}/outside.md", 1, 1, self.root)
            with self.assertRaisesRegex(ValueError, "line range"):
                md_mcp_server.handle_read_section("guide.md", 0, 1, self.root)

    def test_tool_errors_are_reported_as_mcp_errors(self) -> None:
        response = md_mcp_server.process_request(
            {
                "id": 4,
                "method": "tools/call",
                "params": {"name": "read_doc_section", "arguments": {"file_path": "../missing.md"}},
            },
            self.root,
        )
        self.assertTrue(response["result"]["isError"])
        self.assertIn("Error:", response["result"]["content"][0]["text"])

    def test_unknown_method_and_initialized_notification(self) -> None:
        response = md_mcp_server.process_request({"id": "x", "method": "unknown"}, self.root)
        self.assertEqual(response["error"]["code"], -32601)
        self.assertIsNone(md_mcp_server.process_request({"method": "notifications/initialized"}, self.root))


if __name__ == "__main__":
    unittest.main()
