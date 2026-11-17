import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { setupRepository, SetupConflictError } from "../src/setup.js";

const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../bin/md-doc-search.js");

function temporaryRepo(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "md-doc-search-"));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  return repo;
}

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
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
  const agents = fs.readFileSync(path.join(repo, "AGENTS.md"), "utf8");
  assert.match(agents, /<!-- md-doc-search:begin -->/);
  assert.match(agents, /For large reference documents/);
  assert.match(agents, /instruction files such as `AGENTS\.md`, `SKILL\.md`, and custom agent definitions/);
  assert.match(agents, /search results must not replace the full applicable instructions/);
  assert.match(fs.readFileSync(path.join(repo, ".gitignore"), "utf8"), /\/\.docs_index\.sqlite/);
  const config = JSON.parse(fs.readFileSync(path.join(repo, ".mcp.json"), "utf8"));
  assert.equal(config.mcpServers["md-doc-search"].args[0], path.join(repo, "scripts/md_mcp_server.py"));
  assert.deepEqual(setupRepository({ repoPath: repo, apply: true }).changes, []);
});

test("status syncs and reports document and section counts through the CLI", (t) => {
  const repo = temporaryRepo(t);
  const setup = runCli(["init", "--repo", repo, "--apply"]);
  assert.equal(setup.status, 0, setup.stderr);
  fs.writeFileSync(path.join(repo, "guide.md"), "# Guide\nSearchable text.\n");

  const python = process.platform === "win32" ? "python" : "python3";
  const status = runCli(["status", "--repo", repo, "--json", "--python", python]);
  assert.equal(status.status, 0, status.stderr);
  const result = JSON.parse(status.stdout);
  assert.equal(result.documents, 2);
  assert.equal(result.sections, 3);
  assert.equal(result.changed, 2);
  assert.equal(result.removed, 0);
  assert.equal(result.initialized, true);
});

test("inspect syncs and lists indexed file metadata and sections through the CLI", (t) => {
  const repo = temporaryRepo(t);
  const setup = runCli(["init", "--repo", repo, "--apply"]);
  assert.equal(setup.status, 0, setup.stderr);
  fs.writeFileSync(path.join(repo, "guide.md"), "# Guide\nIntro.\n## Details\nMore.\n");

  const inspection = runCli(["inspect", "--repo", repo, "--file", "guide.md", "--json"]);
  assert.equal(inspection.status, 0, inspection.stderr);
  const result = JSON.parse(inspection.stdout);
  assert.equal(result.documents, 1);
  assert.equal(result.sections, 2);
  assert.equal(result.files[0].file_path, "guide.md");
  assert.equal(result.files[0].size, fs.statSync(path.join(repo, "guide.md")).size);
  assert.match(result.files[0].mtime_ns, /^\d+$/);
  assert.match(result.files[0].modified, /^\d{4}-\d\d-\d\dT.*\+00:00$/);
  assert.deepEqual(result.files[0].sections, [
    { heading_path: "Guide", start_line: 1, end_line: 2 },
    { heading_path: "Guide > Details", start_line: 3, end_line: 4 },
  ]);

  const humanReadable = runCli(["inspect", "--repo", repo, "--file", "guide.md"]);
  assert.equal(humanReadable.status, 0, humanReadable.stderr);
  assert.match(humanReadable.stdout, /FILE: guide\.md \(size: \d+ bytes, modified:/);
  assert.match(humanReadable.stdout, /SECTION: Guide > Details \(lines 3-4\)/);
});

test("search syncs and returns ranked matching sections through the CLI", (t) => {
  const repo = temporaryRepo(t);
  const setup = runCli(["init", "--repo", repo, "--apply"]);
  assert.equal(setup.status, 0, setup.stderr);
  fs.writeFileSync(path.join(repo, "guide.md"), "# Deployment\nUse the blue widget for production rollout.\n");

  const search = runCli(["search", "blue widget", "--repo", repo, "--json"]);
  assert.equal(search.status, 0, search.stderr);
  const result = JSON.parse(search.stdout);
  assert.equal(result.query, "blue widget");
  assert.equal(result.results[0].file_path, "guide.md");
  assert.equal(result.results[0].heading_path, "Deployment");
  assert.match(result.results[0].snippet, /blue/);
  assert.match(result.results[0].snippet, /widget/);
});

test("index updates incrementally and rebuilds on force", (t) => {
  const repo = temporaryRepo(t);
  const setup = runCli(["init", "--repo", repo, "--apply"]);
  assert.equal(setup.status, 0, setup.stderr);
  fs.writeFileSync(path.join(repo, "guide.md"), "# Guide\nIndex this text.\n");

  const index = runCli(["index", "--repo", repo, "--json"]);
  assert.equal(index.status, 0, index.stderr);
  assert.deepEqual(JSON.parse(index.stdout), { changed: 2, removed: 0, forced: false });

  const rebuild = runCli(["index", "--repo", repo, "--force", "--json"]);
  assert.equal(rebuild.status, 0, rebuild.stderr);
  assert.deepEqual(JSON.parse(rebuild.stdout), { changed: 2, removed: 0, forced: true });
});

test("read returns a bounded repository-relative range through the CLI", (t) => {
  const repo = temporaryRepo(t);
  const setup = runCli(["init", "--repo", repo, "--apply"]);
  assert.equal(setup.status, 0, setup.stderr);
  fs.writeFileSync(path.join(repo, "guide.md"), "# Guide\nFirst line.\nSecond line.\n");

  const read = runCli([
    "read",
    "guide.md",
    "--start-line",
    "2",
    "--end-line",
    "3",
    "--repo",
    repo,
    "--json",
  ]);
  assert.equal(read.status, 0, read.stderr);
  const section = JSON.parse(read.stdout);
  assert.equal(section.file_path, "guide.md");
  assert.equal(section.start_line, 2);
  assert.equal(section.end_line, 3);
  assert.deepEqual(section.lines, ["First line.", "Second line."]);
});

test("read rejects paths outside the repository and caps output at 250 lines", (t) => {
  const repo = temporaryRepo(t);
  const setup = runCli(["init", "--repo", repo, "--apply"]);
  assert.equal(setup.status, 0, setup.stderr);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "md-doc-search-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, "private.md"), "outside\n");

  const escapedPath = path.relative(repo, path.join(outside, "private.md"));
  const rejected = runCli([
    "read",
    escapedPath,
    "--start-line",
    "1",
    "--end-line",
    "1",
    "--repo",
    repo,
  ]);
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, /path escapes the repository/);

  fs.writeFileSync(path.join(repo, "long.md"), Array.from({ length: 300 }, (_, index) => `Line ${index + 1}`).join("\n"));
  const bounded = runCli([
    "read",
    "long.md",
    "--start-line",
    "1",
    "--end-line",
    "300",
    "--repo",
    repo,
    "--json",
  ]);
  assert.equal(bounded.status, 0, bounded.stderr);
  const section = JSON.parse(bounded.stdout);
  assert.equal(section.end_line, 250);
  assert.equal(section.lines.length, 250);
});

test("doctor checks installation and runtime without creating the index", (t) => {
  const repo = temporaryRepo(t);
  const setup = runCli(["init", "--repo", repo, "--apply"]);
  assert.equal(setup.status, 0, setup.stderr);

  const doctor = runCli(["doctor", "--repo", repo, "--json"]);
  assert.equal(doctor.status, 0, doctor.stderr);
  const result = JSON.parse(doctor.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.database_exists, false);
  assert.ok(result.checks.some((check) => check.name === "SQLite FTS5" && check.ok));
  assert.equal(fs.existsSync(path.join(repo, ".docs_index.sqlite")), false);

  const customConfig = ".config/mcp.json";
  const customSetup = runCli(["init", "--repo", repo, "--mcp-config", customConfig, "--apply"]);
  assert.equal(customSetup.status, 0, customSetup.stderr);
  const customDoctor = runCli(["doctor", "--repo", repo, "--mcp-config", customConfig, "--json"]);
  assert.equal(customDoctor.status, 0, customDoctor.stderr);
  assert.equal(JSON.parse(customDoctor.stdout).ok, true);
});

test("doctor reports an uninitialized repository as a structured failure", (t) => {
  const repo = temporaryRepo(t);
  const doctor = runCli(["doctor", "--repo", repo, "--json"]);
  assert.equal(doctor.status, 1);
  const result = JSON.parse(doctor.stdout);
  assert.equal(result.ok, false);
  assert.ok(result.checks.some((check) => check.name === "Indexer script" && !check.ok));
  assert.ok(result.checks.some((check) => check.name === "MCP server script" && !check.ok));
  assert.ok(result.checks.some((check) => check.name === "SQLite FTS5" && check.ok));
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
