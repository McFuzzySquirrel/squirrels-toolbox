#!/usr/bin/env python3
"""Fail when a newly added skill lacks Po (proof of execution) metadata.

Usage: check_po_tag.py <base-ref>
Checks every SKILL.md added under collection/skills/ since <base-ref>.
"""
import re
import subprocess
import sys
from pathlib import Path

REQUIRED = {
    "po-verified": re.compile(r"\d{4}-\d{2}-\d{2}"),
    "po-record-sha256": re.compile(r"[0-9a-f]{64}"),
    "po-skill-sha256": re.compile(r"[0-9a-f]{64}"),
}


def added_skills(base):
    out = subprocess.run(
        ["git", "diff", "--diff-filter=A", "--name-only", f"{base}...HEAD",
         "--", "collection/skills/*/SKILL.md"],
        check=True, capture_output=True, text=True,
    ).stdout
    return [Path(p) for p in out.split() if p]


def metadata(text):
    m = re.match(r"---\r?\n(.*?)\r?\n---", text, re.S)
    if not m:
        return None
    found, in_meta = {}, False
    for line in m.group(1).splitlines():
        if re.match(r"metadata:\s*$", line):
            in_meta = True
        elif in_meta and re.match(r"\s+\S", line):
            key, _, val = line.strip().partition(":")
            found[key.strip()] = val.strip().strip("\"'")
        elif line.strip():
            in_meta = False
    return found


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
    failures = 0
    for skill in added_skills(base):
        errors = []
        meta = metadata(skill.read_text(encoding="utf-8"))
        if meta is None:
            errors.append("missing YAML frontmatter")
        else:
            for key, pattern in REQUIRED.items():
                if not pattern.fullmatch(meta.get(key, "")):
                    errors.append(f"metadata.{key} missing or malformed")
        if "PO:BEGIN" in skill.read_text(encoding="utf-8"):
            errors.append("leftover PO:BEGIN block in SKILL.md")
        for e in errors:
            print(f"::error file={skill}::{e}. Run the proof-of-execution skill on this skill and add the resulting tag.")
        failures += bool(errors)
        print(f"{'FAIL' if errors else 'ok  '} {skill}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
