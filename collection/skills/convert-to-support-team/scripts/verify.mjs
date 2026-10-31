#!/usr/bin/env node
// verify.mjs — post-handoff gate.
//
// Fails when approved-retirement paths survive, active files still reference
// them, agent or skill frontmatter is invalid, an agent scope points at a path
// that does not exist, the support charter is missing, or a generated team
// leaves a source area unowned.
//
// Usage:
//   node scripts/verify.mjs --repo <repo> [--plan .handoff/plan.json]
//                           [--harness-root .agents] [--strict-coverage]
//                           [--json] [--commit]

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  PLAN_PATH,
  agentFiles,
  classifySkills,
  coverage,
  ensureGitignore,
  extractScopePaths,
  globToRegExp,
  isGitRepo,
  loadPlan,
  parseFrontmatter,
  readText,
  rel,
  resolveHarness,
  scanDangling,
  scopePathExists,
  unquote,
} from "./lib.mjs";

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const hasFlag = (flag) => args.includes(flag);
const repo = path.resolve(valueFor("--repo") ?? process.cwd());
const planPath = valueFor("--plan") ?? PLAN_PATH;
const strictCoverage = hasFlag("--strict-coverage");
const commit = hasFlag("--commit");

let plan;
try {
  plan = loadPlan(repo, planPath);
} catch (error) {
  process.stderr.write(`✖ ${error.message}\n`);
  process.exit(1);
}

const errors = [];
const warnings = [];
const addError = (file, message) => errors.push({ path: file, message });
const addWarning = (file, message) => warnings.push({ path: file, message });

const harnessResult = resolveHarness(repo, valueFor("--harness-root") ?? plan.harnessRoot ?? undefined);
if (harnessResult.error) addError(".", harnessResult.error);
const harness = harnessResult.selected;

const keepPatterns = plan.keep.map((pattern) => globToRegExp(pattern));
const isKept = (relativePath) => keepPatterns.some((pattern) => pattern.test(relativePath));
const effectivePlan = {
  ...plan,
  retire: plan.retire.filter((item) => !isKept(item)),
  retireSkills: plan.retireSkills.filter((item) => !isKept(item)),
  retiredAgents: plan.retiredAgents.filter((item) => !isKept(item)),
};

const retired = [...effectivePlan.retire, ...effectivePlan.retireSkills, ...effectivePlan.retiredAgents];
for (const relativePath of retired) {
  if (fs.existsSync(path.join(repo, relativePath))) {
    addError(relativePath, "still present after retirement");
  }
}

const agents = harness ? agentFiles(repo, harness).map((file) => rel(repo, file)) : [];
if (agents.length === 0) {
  addError(harness?.rootRel ?? ".", "no surviving agents found");
}

for (const relativePath of agents) {
  const file = path.join(repo, relativePath);
  const parsed = parseFrontmatter(readText(file));
  if (!parsed) {
    addError(relativePath, "missing or unterminated frontmatter block");
    continue;
  }
  for (const error of parsed.errors) addError(relativePath, error);
  const name = unquote(parsed.data.name);
  const description = unquote(parsed.data.description);
  if (!name) addError(relativePath, "missing 'name' frontmatter");
  if (name && name !== path.basename(relativePath, ".md")) {
    addError(relativePath, `frontmatter name '${name}' does not match filename`);
  }
  if (!description) addError(relativePath, "missing 'description' frontmatter");
  const scopes = extractScopePaths(parsed.body);
  if (scopes.length === 0) {
    addError(relativePath, "missing '## Scope' with at least one backticked path");
  }
  for (const scope of scopes) {
    if (!scopePathExists(repo, scope)) addError(relativePath, `scope path does not exist: ${scope}`);
  }
}

if (harness) {
  for (const skill of classifySkills(repo, harness)) {
    for (const issue of skill.issues) addError(skill.path, issue);
  }
}

const supportDoc = path.join(repo, "docs", "SUPPORT.md");
if (!fs.existsSync(supportDoc)) {
  addError("docs/SUPPORT.md", "missing support-team charter");
} else {
  const support = readText(supportDoc);
  for (const relativePath of agents) {
    const name = path.basename(relativePath, ".md");
    if (!support.includes(name)) addWarning("docs/SUPPORT.md", `support charter does not mention '${name}'`);
  }
  for (const section of ["Ownership", "Intake", "Release checklist", "Escalation"]) {
    if (!new RegExp(`^##\\s+${section}\\s*$`, "im").test(support)) {
      addWarning("docs/SUPPORT.md", `missing '## ${section}' section`);
    }
  }
  for (const doc of plan.preservedDocs) {
    if (!fs.existsSync(path.join(repo, doc))) {
      addWarning("docs/SUPPORT.md", `preserved document does not exist: ${doc}`);
      continue;
    }
    if (!support.includes(doc)) {
      addWarning("docs/SUPPORT.md", `preserved document is not listed: ${doc}`);
    }
  }
}

const coverageResult = coverage(repo, agents);
for (const dir of coverageResult.uncovered) {
  const message = "source area is not covered by any agent's Scope";
  if (plan.mode === "generate" || strictCoverage) addError(dir, message);
  else addWarning(dir, message);
}
for (const relativePath of coverageResult.ownerless) {
  addWarning(relativePath, "agent has no Scope paths");
}
for (const relativePath of coverageResult.irrelevant) {
  addWarning(relativePath, "agent Scope matches no known source, test, CI, or documentation path");
}

for (const finding of scanDangling(repo, harness, effectivePlan)) {
  addError(
    finding.path,
    `line ${finding.line}: references retired path '${finding.marker}' — ${finding.text}`,
  );
}

let commitResult = null;
if (errors.length === 0 && commit) {
  if (!isGitRepo(repo)) {
    addWarning(".", "--commit ignored: not a git repository");
  } else {
    try {
      ensureGitignore(repo);
      const status = execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim();
      if (!status) {
        addWarning(".", "--commit ignored: nothing to commit");
      } else {
        execFileSync("git", ["add", "-A"], { cwd: repo, encoding: "utf8" });
        execFileSync(
          "git",
          ["commit", "-m", "chore: convert build team to support team"],
          { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
        commitResult = "chore: convert build team to support team";
      }
    } catch (error) {
      addError(".", `commit failed: ${error.message.split("\n")[0]}`);
    }
  }
}

const result = {
  ok: errors.length === 0,
  repo,
  harnessRoot: harness?.rootRel ?? null,
  mode: plan.mode,
  errors,
  warnings,
  coverage: coverageResult,
  commit: commitResult,
};

if (hasFlag("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  if (result.ok) process.stdout.write("✔ Handoff verification passed.\n");
  else {
    process.stdout.write(`✖ Handoff verification failed with ${errors.length} error(s):\n`);
    for (const item of errors) process.stdout.write(`  ${item.path}: ${item.message}\n`);
  }
  if (warnings.length > 0) {
    process.stdout.write(`\n⚠ ${warnings.length} warning(s):\n`);
    for (const item of warnings) process.stdout.write(`  ${item.path}: ${item.message}\n`);
  }
  if (commitResult) process.stdout.write(`\nCommitted: ${commitResult}\n`);
}

process.exit(result.ok ? 0 : 1);
