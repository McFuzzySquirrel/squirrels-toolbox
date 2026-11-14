import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { setupRepository, SetupConflictError } from "../src/setup.js";

function temporaryRepo(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "md-doc-search-"));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  return repo;
}

test("preview is read-only and apply is idempotent", (t) => {
  const repo = temporaryRepo(t);
  const preview = setupRepository({ repoPath: repo });
  assert.equal(preview.applied, false);
  assert.equal(preview.changes.length, 5);
  assert.equal(fs.existsSync(path.join(repo, "scripts")), false);

  const applied = setupRepository({ repoPath: repo, apply: true });
  assert.deepEqual(new Set(applied.changes.map(({ path: file }) => file)), new Set([
    "AGENTS.md",
    ".gitignore",
    ".mcp.json",
    "scripts/md_index.py",
    "scripts/md_mcp_server.py",
  ]));
  assert.match(fs.readFileSync(path.join(repo, "AGENTS.md"), "utf8"), /<!-- md-doc-search:begin -->/);
  assert.match(fs.readFileSync(path.join(repo, ".gitignore"), "utf8"), /\/\.docs_index\.sqlite/);
  const config = JSON.parse(fs.readFileSync(path.join(repo, ".mcp.json"), "utf8"));
  assert.equal(config.mcpServers["md-doc-search"].args[0], path.join(repo, "scripts/md_mcp_server.py"));
  assert.deepEqual(setupRepository({ repoPath: repo, apply: true }).changes, []);
});

test("existing instructions, ignore rules, and other MCP entries are preserved", (t) => {
  const repo = temporaryRepo(t);
  fs.writeFileSync(path.join(repo, "AGENTS.md"), "# Existing\nKeep this rule.\n");
  fs.writeFileSync(path.join(repo, ".gitignore"), "*.pyc\n");
  fs.writeFileSync(path.join(repo, ".mcp.json"), JSON.stringify({
    mcpServers: { other: { command: "node", args: ["server.js"] } },
  }));

  setupRepository({ repoPath: repo, apply: true });
  assert.match(fs.readFileSync(path.join(repo, "AGENTS.md"), "utf8"), /Keep this rule\./);
  const config = JSON.parse(fs.readFileSync(path.join(repo, ".mcp.json"), "utf8"));
  assert.ok(config.mcpServers.other);
  assert.ok(config.mcpServers["md-doc-search"]);
});

test("conflicts abort without partial writes; force replaces only owned entries", (t) => {
  const repo = temporaryRepo(t);
  fs.mkdirSync(path.join(repo, "scripts"));
  fs.writeFileSync(path.join(repo, "scripts/md_index.py"), "custom indexer\n");
  assert.throws(
    () => setupRepository({ repoPath: repo, apply: true }),
    (error) => error instanceof SetupConflictError && /not managed/.test(error.message),
  );
  assert.equal(fs.existsSync(path.join(repo, "AGENTS.md")), false);
  assert.equal(fs.readFileSync(path.join(repo, "scripts/md_index.py"), "utf8"), "custom indexer\n");

  setupRepository({ repoPath: repo, apply: true, force: true });
  assert.match(fs.readFileSync(path.join(repo, "scripts/md_index.py"), "utf8"), /Incrementally index/);
});

test("existing unrecognized MCP entry requires force", (t) => {
  const repo = temporaryRepo(t);
  fs.writeFileSync(path.join(repo, ".mcp.json"), JSON.stringify({
    mcpServers: { "md-doc-search": { command: "custom", args: [] } },
  }));
  assert.throws(
    () => setupRepository({ repoPath: repo, apply: true }),
    (error) => error instanceof SetupConflictError && /unrecognized/.test(error.message),
  );
  assert.equal(fs.existsSync(path.join(repo, "scripts")), false);
});

test("null MCP entry requires force before replacement", (t) => {
  const repo = temporaryRepo(t);
  fs.writeFileSync(path.join(repo, ".mcp.json"), JSON.stringify({
    mcpServers: { "md-doc-search": null },
  }));
  assert.throws(
    () => setupRepository({ repoPath: repo, apply: true }),
    (error) => error instanceof SetupConflictError && /unrecognized/.test(error.message),
  );
  assert.equal(fs.existsSync(path.join(repo, "scripts")), false);
});

test("setup refuses config paths outside the repository and symlinked outputs", (t) => {
  const repo = temporaryRepo(t);
  assert.throws(
    () => setupRepository({ repoPath: repo, mcpConfig: "../outside.json" }),
    /outside the target repository/,
  );

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "md-doc-search-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(repo, "scripts"), "dir");
  assert.throws(
    () => setupRepository({ repoPath: repo, apply: true }),
    (error) => error instanceof SetupConflictError && /symlink|outside/.test(error.message),
  );
  assert.deepEqual(fs.readdirSync(outside), []);
});
