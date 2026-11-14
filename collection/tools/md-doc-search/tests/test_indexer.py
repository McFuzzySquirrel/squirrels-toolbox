from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TEMPLATE_DIR = Path(__file__).parents[1] / "templates"
sys.path.insert(0, str(TEMPLATE_DIR))

import md_index


class MarkdownIndexerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_parser_tracks_nested_headings_and_ignores_fenced_code(self) -> None:
        document = self.root / "guide.md"
        document.write_text(
            "# Guide\nintro\n\n## Setup\nsteps\n```md\n# not a heading\n```\n"
            "### Details\nmore\n## Finish\nend\n",
            encoding="utf-8",
        )

        sections = md_index.parse_markdown_sections(document, "guide.md")

        self.assertEqual(
            [section[1] for section in sections],
            ["Guide", "Guide > Setup", "Guide > Setup > Details", "Guide > Finish"],
        )
        self.assertNotIn("# not a heading", [section[1] for section in sections])
        self.assertEqual(sections[1][2:4], (4, 8))

    def test_sync_detects_add_modify_delete_and_skips_unchanged_files(self) -> None:
        document = self.root / "docs" / "guide.md"
        document.parent.mkdir()
        document.write_text("# Guide\nalpha instructions\n", encoding="utf-8")

        self.assertEqual(md_index.sync_index(self.root), (1, 0))
        self.assertEqual(md_index.sync_index(self.root), (0, 0))
        self.assertTrue(md_index.search_index("alpha", root_dir=self.root))

        document.write_text("# Guide\nbravo instructions with changed size\n", encoding="utf-8")
        self.assertEqual(md_index.sync_index(self.root), (1, 0))
        self.assertEqual(md_index.search_index("alpha", root_dir=self.root), [])
        self.assertTrue(md_index.search_index("bravo", root_dir=self.root))

        document.unlink()
        self.assertEqual(md_index.sync_index(self.root), (0, 1))
        self.assertEqual(md_index.search_index("bravo", root_dir=self.root), [])

    def test_force_rebuild_and_directory_ignores_are_scoped_to_root(self) -> None:
        (self.root / "node_modules").mkdir()
        (self.root / "node_modules" / "ignored.md").write_text("# Hidden\nneedle\n", encoding="utf-8")
        (self.root / "visible.md").write_text("# Visible\nneedle\n", encoding="utf-8")

        self.assertEqual(md_index.sync_index(self.root), (1, 0))
        self.assertEqual(md_index.sync_index(self.root, force=True), (1, 0))
        rows = md_index.search_index("needle", root_dir=self.root)
        self.assertEqual([row[0] for row in rows], ["visible.md"])
        self.assertTrue((self.root / md_index.DB_NAME).is_file())

        other_root = self.root / "other"
        other_root.mkdir()
        (other_root / "other.md").write_text("# Other\nneedle\n", encoding="utf-8")
        self.assertEqual(md_index.sync_index(other_root), (1, 0))
        self.assertTrue((other_root / md_index.DB_NAME).is_file())

    def test_invalid_fts_expression_falls_back_to_safe_terms(self) -> None:
        (self.root / "search.md").write_text("# Search\nfallbackword exists\n", encoding="utf-8")
        md_index.sync_index(self.root)

        self.assertTrue(md_index.search_index('"fallbackword', root_dir=self.root))

    def test_index_refuses_database_symlink(self) -> None:
        target = self.root / "external.sqlite"
        target.write_bytes(b"not a database")
        (self.root / md_index.DB_NAME).symlink_to(target)

        with self.assertRaisesRegex(ValueError, "through a symlink"):
            md_index.sync_index(self.root)
        self.assertEqual(target.read_bytes(), b"not a database")

    def test_status_syncs_and_reports_document_and_section_counts(self) -> None:
        (self.root / "guide.md").write_text("# Guide\nSearchable text.\n", encoding="utf-8")
        command = [
            sys.executable,
            str(TEMPLATE_DIR / "md_index.py"),
            "status",
            "--dir",
            str(self.root),
            "--json",
        ]

        first = subprocess.run(command, capture_output=True, text=True, check=False)
        self.assertEqual(first.returncode, 0, first.stderr)
        first_status = json.loads(first.stdout)
        self.assertEqual(first_status["documents"], 1)
        self.assertEqual(first_status["sections"], 1)
        self.assertEqual(first_status["changed"], 1)
        self.assertEqual(first_status["removed"], 0)
        self.assertTrue(first_status["initialized"])

        second = subprocess.run(command, capture_output=True, text=True, check=False)
        self.assertEqual(second.returncode, 0, second.stderr)
        second_status = json.loads(second.stdout)
        self.assertEqual(second_status["documents"], 1)
        self.assertEqual(second_status["sections"], 1)
        self.assertEqual(second_status["changed"], 0)
        self.assertFalse(second_status["initialized"])

        (self.root / "guide.md").write_text("# Guide\nUpdated searchable text.\n", encoding="utf-8")
        (self.root / "extra.md").write_text("# Extra\nAdditional text.\n", encoding="utf-8")
        changed = subprocess.run(command, capture_output=True, text=True, check=False)
        self.assertEqual(changed.returncode, 0, changed.stderr)
        changed_status = json.loads(changed.stdout)
        self.assertEqual(changed_status["documents"], 2)
        self.assertEqual(changed_status["sections"], 2)
        self.assertEqual(changed_status["changed"], 2)
        self.assertEqual(changed_status["removed"], 0)

        (self.root / "extra.md").unlink()
        removed = subprocess.run(command, capture_output=True, text=True, check=False)
        self.assertEqual(removed.returncode, 0, removed.stderr)
        removed_status = json.loads(removed.stdout)
        self.assertEqual(removed_status["documents"], 1)
        self.assertEqual(removed_status["sections"], 1)
        self.assertEqual(removed_status["changed"], 0)
        self.assertEqual(removed_status["removed"], 1)

    def test_read_returns_numbered_repository_relative_lines(self) -> None:
        (self.root / "guide.md").write_text("# Guide\nFirst line.\nSecond line.\n", encoding="utf-8")
        result = subprocess.run(
            [
                sys.executable,
                str(TEMPLATE_DIR / "md_index.py"),
                "read",
                "guide.md",
                "--start-line",
                "2",
                "--end-line",
                "3",
                "--dir",
                str(self.root),
                "--json",
            ],
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        section = json.loads(result.stdout)
        self.assertEqual(section["file_path"], "guide.md")
        self.assertEqual(section["start_line"], 2)
        self.assertEqual(section["end_line"], 3)
        self.assertEqual(section["total_lines"], 3)
        self.assertEqual(section["lines"], ["First line.", "Second line."])


if __name__ == "__main__":
    unittest.main()
