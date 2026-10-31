import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const INVENTORY = path.join(SCRIPT_DIR, "inventory.mjs");
const APPLY = path.join(SCRIPT_DIR, "apply.mjs");
const VERIFY = path.join(SCRIPT_DIR, "verify.mjs");

function writeAgent(repo, dir, name, scopes, description) {
  fs.mkdirSync(dir, { recursive: true });
  const scopeList = scopes.map((scope) => `- \`${scope}\``).join("\n");
  fs.writeFileSync(
    path.join(dir, `${name}.md`),
    `---\nname: ${name}\ndescription: "${description}"\nmode: all\n---\n\nMaintains this area.\n\n## Scope\n\n${scopeList}\n\n## Support Responsibilities\n\n- Fix defects and add regression tests.\n`,
  );
}

function writeSkill(repo, dir, name) {
  const skillDir = path.join(dir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: "Operational release procedure."\n---\n\n# ${name}\n\nRun the release checks.\n`,
  );
}

function writeSupport(repo, names, preserved = []) {
  const rows = names.map((name) => `| ${name} | owns its scope |`).join("\n");
  const preservedBlock = preserved.length > 0
    ? `\n## Preserved build documents\n\n${preserved.map((doc) => `- \`${doc}\` — historical context.`).join("\n")}\n`
    : "";
  fs.writeFileSync(
    path.join(repo, "docs", "SUPPORT.md"),
    `# Support\n\n## Team\n\n| Agent | Scope |\n|---|---|\n${rows}\n\n## Ownership\n\nSee the table above.\n\n## Intake\n\nCapture the report, route it, reproduce it, fix it.\n\n## Release checklist\n\n- [ ] Owned checks pass.\n\n## Escalation\n\nCross-module decisions go to the lead.\n${preservedBlock}`,
  );
}

function makeRepo({
  harness = ".agents",
  rootHarness = false,
  multiple = false,
  agents = true,
  skills = true,
  support = true,
  git = true,
} = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "convert-support-"));
  fs.mkdirSync(path.join(repo, "src", "api"), { recursive: true });
  fs.mkdirSync(path.join(repo, "src", "ui"), { recursive: true });
  fs.mkdirSync(path.join(repo, "docs"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "api", "index.ts"), "export const api = 1;\n");
  fs.writeFileSync(path.join(repo, "src", "ui", "app.ts"), "export const app = 1;\n");
  fs.writeFileSync(path.join(repo, "README.md"), "# Project\n\nA small project.\n");
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "node --test" } }));
  fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules/\n.handoff/\n.handoff-archive/\n");

  const harnessDir = rootHarness ? repo : path.join(repo, harness);
  const agentsDir = path.join(harnessDir, "agents");
  const skillsDir = path.join(harnessDir, "skills");
  if (agents) {
    writeAgent(repo, agentsDir, "tech-lead", ["docs/", "README.md"], "Coordinates support and releases.");
    writeAgent(repo, agentsDir, "api-engineer", ["src/api"], "Maintains the API.");
    writeAgent(repo, agentsDir, "ui-engineer", ["src/ui"], "Maintains the UI.");
  }
  if (skills) writeSkill(repo, skillsDir, "release-runbook");
  if (multiple) writeAgent(repo, path.join(repo, ".claude", "agents"), "other", ["src/api"], "Another agent.");
  if (support) writeSupport(repo, ["tech-lead", "api-engineer", "ui-engineer"]);
  if (git) {
    execFileSync("git", ["init", "-q"], { cwd: repo });
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"],
      { cwd: repo },
    );
  }
  return { repo, harnessRoot: rootHarness ? "." : harness };
}

function writePlan(repo, overrides = {}) {
  const plan = {
    version: 1,
    mode: "convert",
    harnessRoot: ".agents",
    retire: [],
    retireSkills: [],
    retiredAgents: [],
    preservedDocs: [],
    rewrite: [],
    keep: [],
    generatedAgents: [],
    ...overrides,
  };
  fs.mkdirSync(path.join(repo, ".handoff"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".handoff", "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

function commitAll(repo, message = "update") {
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", message],
    { cwd: repo },
  );
}

function run(script, repo, args = []) {
  return execFileSync(process.execPath, [script, "--repo", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runFailure(script, repo, args = []) {
  try {
    const output = run(script, repo, args);
    assert.fail(`expected command to fail, but it passed:\n${output}`);
  } catch (error) {
    if (error.code === "ERR_ASSERTION") throw error;
    return {
      status: error.status,
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? ""),
    };
  }
}

function gitStatus(repo) {
  return execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" });
}

test("inventory detects agents, skills, source areas, and stays read-only", () => {
  const { repo } = makeRepo();
  const before = gitStatus(repo);
  const output = run(INVENTORY, repo, ["--json"]);
  const plan = JSON.parse(output);

  assert.equal(plan.harness.selected, ".agents");
  assert.equal(plan.agents.length, 3);
  assert.equal(plan.skills.length, 1);
  assert.ok(plan.repoMap.sourceDirectories.includes("src/api"));
  assert.ok(plan.repoMap.sourceDirectories.includes("src/ui"));
  assert.equal(gitStatus(repo), before);
  assert.equal(plan.summary.agents, 3);
});

test("inventory detects workspace packages as ownership areas", () => {
  const { repo } = makeRepo();
  fs.mkdirSync(path.join(repo, "packages", "api", "src"), { recursive: true });
  fs.mkdirSync(path.join(repo, "packages", "web", "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "packages", "api", "src", "index.ts"), "export const api = 1;\n");
  fs.writeFileSync(path.join(repo, "packages", "web", "src", "app.tsx"), "export const web = 1;\n");

  const plan = JSON.parse(run(INVENTORY, repo, ["--json"]));
  assert.ok(plan.repoMap.sourceDirectories.includes("packages/api/src"));
  assert.ok(plan.repoMap.sourceDirectories.includes("packages/web/src"));
  assert.ok(plan.repoMap.workspaces.includes("packages/api"));
  assert.ok(plan.repoMap.workspaces.includes("packages/web"));
});

test("inventory detects a root-level agents and skills layout", () => {
  const { repo } = makeRepo({ rootHarness: true });
  const plan = JSON.parse(run(INVENTORY, repo, ["--json"]));
  assert.equal(plan.harness.selected, ".");
  assert.ok(plan.agents.some((agent) => agent.path === "agents/api-engineer.md"));
  assert.ok(plan.skills.some((skill) => skill.path === "skills/release-runbook"));
});

test("inventory reports multiple harness roots instead of guessing", () => {
  const { repo } = makeRepo({ multiple: true });
  const plan = JSON.parse(run(INVENTORY, repo, ["--json"]));
  assert.equal(plan.harness.selected, null);
  assert.equal(plan.harness.candidates.length, 2);
  assert.match(plan.preflight.warnings.join("\n"), /multiple agent harnesses/i);
});

test("apply archives a retired path and writes a manifest", () => {
  const { repo } = makeRepo();
  fs.writeFileSync(path.join(repo, "docs", "old-plan.md"), "# Old plan\n");
  commitAll(repo, "add old plan");
  writePlan(repo, { retire: ["docs/old-plan.md"] });

  const output = run(APPLY, repo, ["--apply"]);
  assert.match(output, /Archived 1 path/);
  assert.equal(fs.existsSync(path.join(repo, "docs", "old-plan.md")), false);

  const archive = path.join(repo, ".handoff-archive");
  const versions = fs.readdirSync(archive);
  assert.equal(versions.length, 1);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(archive, versions[0], "HANDOFF-MANIFEST.json"), "utf8"),
  );
  assert.deepEqual(manifest.paths, ["docs/old-plan.md"]);
  assert.ok(fs.existsSync(path.join(archive, versions[0], "docs", "old-plan.md")));
  assert.match(fs.readFileSync(path.join(repo, ".gitignore"), "utf8"), /\.handoff\//);
});

test("apply --delete removes a retired path without archiving", () => {
  const { repo } = makeRepo();
  fs.writeFileSync(path.join(repo, "docs", "old-plan.md"), "# Old plan\n");
  commitAll(repo, "add old plan");
  writePlan(repo, { retire: ["docs/old-plan.md"] });

  run(APPLY, repo, ["--apply", "--delete"]);
  assert.equal(fs.existsSync(path.join(repo, "docs", "old-plan.md")), false);
  assert.equal(fs.existsSync(path.join(repo, ".handoff-archive")), false);
});

test("apply refuses a dirty tree unless explicitly allowed", () => {
  const { repo } = makeRepo();
  fs.writeFileSync(path.join(repo, "docs", "old-plan.md"), "# Old plan\n");
  commitAll(repo, "add old plan");
  writePlan(repo, { retire: ["docs/old-plan.md"] });
  fs.writeFileSync(path.join(repo, "scratch.txt"), "dirty\n");

  const failure = runFailure(APPLY, repo, ["--apply"]);
  assert.match(failure.stderr, /Working tree is not clean/);
  run(APPLY, repo, ["--apply", "--allow-dirty"]);
  assert.equal(fs.existsSync(path.join(repo, "docs", "old-plan.md")), false);
});

test("apply refuses protected paths and keeps explicit keep paths", () => {
  const { repo } = makeRepo();
  writePlan(repo, { retire: ["README.md"] });
  const protectedFailure = runFailure(APPLY, repo, ["--apply"]);
  assert.match(protectedFailure.stderr, /protected path/);
  assert.ok(fs.existsSync(path.join(repo, "README.md")));

  const manifest = makeRepo();
  writePlan(manifest.repo, { retire: ["package.json"] });
  const manifestFailure = runFailure(APPLY, manifest.repo, ["--apply"]);
  assert.match(manifestFailure.stderr, /protected path/);
  assert.ok(fs.existsSync(path.join(manifest.repo, "package.json")));

  const second = makeRepo();
  fs.writeFileSync(path.join(second.repo, "docs", "old-plan.md"), "# Old plan\n");
  commitAll(second.repo, "add old plan");
  writePlan(second.repo, { retire: ["docs/old-plan.md"] });
  run(APPLY, second.repo, ["--apply", "--keep", "docs/old-plan.md"]);
  assert.ok(fs.existsSync(path.join(second.repo, "docs", "old-plan.md")));
});

test("apply requires git history unless --allow-no-git is passed", () => {
  const { repo } = makeRepo({ git: false });
  fs.writeFileSync(path.join(repo, "docs", "old-plan.md"), "# Old plan\n");
  writePlan(repo, { retire: ["docs/old-plan.md"] });

  const failure = runFailure(APPLY, repo, ["--apply"]);
  assert.match(failure.stderr, /Not a git repository/);
  run(APPLY, repo, ["--apply", "--allow-no-git"]);
  assert.equal(fs.existsSync(path.join(repo, "docs", "old-plan.md")), false);
  assert.ok(fs.existsSync(path.join(repo, ".handoff-archive")));
});

test("verify passes a converted repository", () => {
  const { repo } = makeRepo();
  writePlan(repo);
  const output = run(VERIFY, repo);
  assert.match(output, /Handoff verification passed/);
});

test("verify passes a root-level harness when explicitly selected", () => {
  const { repo } = makeRepo({ rootHarness: true });
  writePlan(repo, { harnessRoot: "." });
  const output = run(VERIFY, repo);
  assert.match(output, /Handoff verification passed/);
});

test("verify requires an explicit root when multiple harnesses exist", () => {
  const { repo } = makeRepo({ multiple: true });
  writePlan(repo, { harnessRoot: null });
  const failure = runFailure(VERIFY, repo);
  assert.match(failure.stdout, /multiple agent harnesses/i);

  writePlan(repo, { harnessRoot: ".agents" });
  const output = run(VERIFY, repo);
  assert.match(output, /Handoff verification passed/);
});

test("verify honors plan keep paths", () => {
  const { repo } = makeRepo();
  fs.writeFileSync(path.join(repo, "docs", "old-plan.md"), "# Old plan\n");
  commitAll(repo, "add old plan");
  writePlan(repo, { retire: ["docs/old-plan.md"], keep: ["docs/old-plan.md"] });
  const output = run(VERIFY, repo);
  assert.match(output, /Handoff verification passed/);
});

test("verify accepts file globs that cover a source area", () => {
  const { repo } = makeRepo();
  writeAgent(repo, path.join(repo, ".agents", "agents"), "api-engineer", ["src/api/**/*.ts"], "Maintains the API.");
  writeAgent(repo, path.join(repo, ".agents", "agents"), "ui-engineer", ["src/ui/**/*.ts"], "Maintains the UI.");
  writePlan(repo);
  const output = run(VERIFY, repo);
  assert.match(output, /Handoff verification passed/);
});

test("verify fails on leftover retirement paths and dangling references", () => {
  const { repo } = makeRepo();
  fs.writeFileSync(path.join(repo, "docs", "old-plan.md"), "# Old plan\n");
  commitAll(repo, "add old plan");
  writePlan(repo, { retire: ["docs/old-plan.md"] });

  const leftover = runFailure(VERIFY, repo);
  assert.match(leftover.stdout, /still present after retirement/);

  fs.rmSync(path.join(repo, "docs", "old-plan.md"));
  fs.writeFileSync(path.join(repo, "README.md"), "# Project\n\nSee docs/old-plan.md for the old plan.\n");
  const dangling = runFailure(VERIFY, repo);
  assert.match(dangling.stdout, /references retired path/);
});

test("verify fails an agent with no scope and a scope path that does not exist", () => {
  const { repo } = makeRepo();
  fs.writeFileSync(
    path.join(repo, ".agents", "agents", "broken.md"),
    '---\nname: broken\ndescription: "Broken agent."\n---\n\nNo scope here.\n',
  );
  writePlan(repo);
  const missingScope = runFailure(VERIFY, repo);
  assert.match(missingScope.stdout, /missing '## Scope'/);

  const second = makeRepo();
  fs.writeFileSync(
    path.join(second.repo, ".agents", "agents", "api-engineer.md"),
    '---\nname: api-engineer\ndescription: "Maintains the API."\n---\n\n## Scope\n\n- `src/missing`\n',
  );
  writePlan(second.repo);
  const missingPath = runFailure(VERIFY, second.repo);
  assert.match(missingPath.stdout, /scope path does not exist/);
});

test("verify warns about uncovered areas when converting and fails when generating", () => {
  const { repo } = makeRepo();
  fs.rmSync(path.join(repo, ".agents", "agents", "ui-engineer.md"));
  writePlan(repo, { mode: "convert" });
  const converted = run(VERIFY, repo);
  assert.match(converted, /Handoff verification passed/);
  assert.match(converted, /source area is not covered/);

  writePlan(repo, { mode: "generate" });
  const generated = runFailure(VERIFY, repo);
  assert.match(generated.stdout, /source area is not covered/);
});

test("verify fails a skill whose name does not match its directory", () => {
  const { repo } = makeRepo();
  fs.writeFileSync(
    path.join(repo, ".agents", "skills", "release-runbook", "SKILL.md"),
    '---\nname: wrong-name\ndescription: "Release runbook."\n---\n\n# Runbook\n',
  );
  writePlan(repo);
  const failure = runFailure(VERIFY, repo);
  assert.match(failure.stdout, /does not match directory/);
});

test("verify lists preserved documents and ignores their historical references", () => {
  const { repo } = makeRepo();
  fs.writeFileSync(path.join(repo, "docs", "spec.md"), "# Spec\n\nSee docs/old-plan.md.\n");
  fs.writeFileSync(path.join(repo, "docs", "old-plan.md"), "# Old plan\n");
  commitAll(repo, "add preserved docs");
  fs.rmSync(path.join(repo, "docs", "old-plan.md"));
  writePlan(repo, { retire: ["docs/old-plan.md"], preservedDocs: ["docs/spec.md"] });

  const missingListing = run(VERIFY, repo);
  assert.match(missingListing, /preserved document is not listed/);

  writeSupport(repo, ["tech-lead", "api-engineer", "ui-engineer"], ["docs/spec.md"]);
  const listed = run(VERIFY, repo);
  assert.match(listed, /Handoff verification passed/);
  assert.doesNotMatch(listed, /preserved document is not listed/);
});
