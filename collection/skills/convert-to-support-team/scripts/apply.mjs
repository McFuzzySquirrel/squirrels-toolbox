#!/usr/bin/env node
// apply.mjs — apply the approved retirement list from a handoff plan.
//
// Only paths listed in the plan are touched. The default is to archive them
// under .handoff-archive/<timestamp>/; pass --delete to remove them outright.
//
// Usage:
//   node scripts/apply.mjs --repo <repo> [--plan .handoff/plan.json]        # dry run
//   node scripts/apply.mjs --repo <repo> --apply
//   node scripts/apply.mjs --repo <repo> --apply --delete
//   node scripts/apply.mjs --repo <repo> --apply --allow-dirty
//   node scripts/apply.mjs --repo <repo> --apply --allow-no-git
//   node scripts/apply.mjs --repo <repo> --apply --keep <glob>

import fs from "node:fs";
import path from "node:path";
import {
  PLAN_PATH,
  SKILL_NAME,
  containsProtectedPath,
  ensureGitignore,
  globToRegExp,
  isClean,
  isGitRepo,
  loadPlan,
  normalizePlanPath,
  posix,
  sourceDirectories,
  testDirectories,
} from "./lib.mjs";

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const valuesFor = (flag) =>
  args.flatMap((value, index) => (value === flag && args[index + 1] ? [args[index + 1]] : []));
const hasFlag = (flag) => args.includes(flag);

const repo = path.resolve(valueFor("--repo") ?? process.cwd());
const planPath = valueFor("--plan") ?? PLAN_PATH;
const apply = hasFlag("--apply");
const allowDirty = hasFlag("--allow-dirty");
const allowNoGit = hasFlag("--allow-no-git");
const deleteMode = hasFlag("--delete");

let plan;
try {
  plan = loadPlan(repo, planPath);
} catch (error) {
  process.stderr.write(`✖ ${error.message}\n`);
  process.exit(1);
}

const gitRepo = isGitRepo(repo);
if (!gitRepo && !allowNoGit) {
  process.stderr.write("✖ Not a git repository. Use --allow-no-git to archive without history.\n");
  process.exit(1);
}
if (gitRepo && !isClean(repo) && !allowDirty) {
  process.stderr.write("✖ Working tree is not clean. Commit or stash first, or pass --allow-dirty.\n");
  process.exit(1);
}
if (!gitRepo && allowNoGit && deleteMode) {
  process.stderr.write("⚠ No git history; forcing archive mode instead of --delete.\n");
}
const archive = !deleteMode || !gitRepo;

const keep = [...plan.keep];
for (const value of valuesFor("--keep")) {
  try {
    keep.push(normalizePlanPath(value));
  } catch (error) {
    process.stderr.write(`✖ ${error.message}\n`);
    process.exit(1);
  }
}
const keepPatterns = keep.map((pattern) => globToRegExp(pattern));
const isKept = (relativePath) => keepPatterns.some((pattern) => pattern.test(relativePath));

const requested = [...new Set([...plan.retire, ...plan.retireSkills, ...plan.retiredAgents])];
const selected = requested.filter((relativePath) => !isKept(relativePath));
const sourceDirs = sourceDirectories(repo);
const testDirs = testDirectories(repo).dirs;
const errors = [];

for (const relativePath of selected) {
  if (relativePath.includes(`skills/${SKILL_NAME}`) || relativePath === `skills/${SKILL_NAME}`) {
    errors.push(`refusing to retire the handoff skill itself: ${relativePath}`);
    continue;
  }
  if (relativePath === ".handoff" || relativePath.startsWith(".handoff/") ||
      relativePath === ".handoff-archive" || relativePath.startsWith(".handoff-archive/")) {
    errors.push(`refusing to retire handoff state: ${relativePath}`);
    continue;
  }
  if (!fs.existsSync(path.join(repo, relativePath))) continue;
  if (containsProtectedPath(repo, relativePath, sourceDirs, testDirs)) {
    errors.push(`refusing to retire protected path: ${relativePath}`);
    continue;
  }
  for (const kept of keep) {
    if (kept.startsWith(`${relativePath}/`)) {
      errors.push(`refusing to retire '${relativePath}': --keep selects a descendant (${kept}); retire files individually`);
      break;
    }
  }
  if (fs.existsSync(path.join(repo, relativePath)) && fs.statSync(path.join(repo, relativePath)).isDirectory()) {
    const globKeep = keep.find((pattern) => /[*?]/.test(pattern));
    if (globKeep) {
      errors.push(`refusing to retire directory '${relativePath}' with glob keep '${globKeep}'; retire files individually`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`✖ ${error}\n`);
  process.exit(1);
}

const present = selected.filter((relativePath) => fs.existsSync(path.join(repo, relativePath)));
const missing = selected.filter((relativePath) => !fs.existsSync(path.join(repo, relativePath)));

if (!apply) {
  process.stdout.write(`Dry run: ${present.length} path(s) would be ${archive ? "archived" : "deleted"}.\n`);
  for (const relativePath of present) process.stdout.write(`  ${archive ? "archive" : "delete"}  ${relativePath}\n`);
  for (const relativePath of missing) process.stdout.write(`  missing  ${relativePath}\n`);
  process.stdout.write("Re-run with --apply to execute.\n");
  process.exit(0);
}

const gitignore = gitRepo ? ensureGitignore(repo) : { changed: false, added: [] };
if (gitignore.changed) {
  process.stdout.write(`Added ${gitignore.added.join(", ")} to .gitignore.\n`);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
let archiveRoot = path.join(repo, ".handoff-archive", timestamp);
let archiveSuffix = 2;
while (fs.existsSync(archiveRoot)) {
  archiveRoot = path.join(repo, ".handoff-archive", `${timestamp}-${archiveSuffix}`);
  archiveSuffix += 1;
}
const archived = [];
const removed = [];

function assertInsideRepo(target) {
  const relative = path.relative(repo, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to touch a path outside the repository: ${target}`);
  }
}

function uniqueDestination(relativePath) {
  let destination = path.join(archiveRoot, relativePath);
  let suffix = 2;
  while (fs.existsSync(destination)) {
    destination = path.join(archiveRoot, `${relativePath}.${suffix}`);
    suffix += 1;
  }
  return destination;
}

function removePath(relativePath) {
  const source = path.join(repo, relativePath);
  assertInsideRepo(source);
  if (!fs.existsSync(source)) return;
  if (archive) {
    const destination = uniqueDestination(relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    try {
      fs.renameSync(source, destination);
    } catch {
      fs.cpSync(source, destination, { recursive: true });
      fs.rmSync(source, { recursive: true, force: true });
    }
    archived.push(relativePath);
  } else {
    fs.rmSync(source, { recursive: true, force: true });
    removed.push(relativePath);
  }
}

for (const relativePath of present) removePath(relativePath);

if (archive && archived.length > 0) {
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    repository: repo,
    mode: plan.mode,
    harnessRoot: plan.harnessRoot,
    paths: archived,
    preservedDocs: plan.preservedDocs,
  };
  fs.mkdirSync(archiveRoot, { recursive: true });
  fs.writeFileSync(path.join(archiveRoot, "HANDOFF-MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

const summary = {
  ok: true,
  repo,
  archive,
  archiveRoot: archived.length > 0 ? posix(path.relative(repo, archiveRoot)) : null,
  plan: posix(path.relative(repo, path.isAbsolute(planPath) ? planPath : path.join(repo, planPath))),
  archived,
  removed,
  missing,
  gitignore,
};

if (hasFlag("--json")) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} else {
  process.stdout.write(
    `${archive ? "Archived" : "Removed"} ${archive ? archived.length : removed.length} path(s)` +
      `${archive && archived.length > 0 ? ` under ${summary.archiveRoot}` : ""}.\n`,
  );
  for (const relativePath of archive ? archived : removed) process.stdout.write(`  ${relativePath}\n`);
  for (const relativePath of missing) process.stdout.write(`  missing  ${relativePath}\n`);
  process.stdout.write("Next: convert or generate the team, update the support charter, then run scripts/verify.mjs.\n");
}

process.exit(0);
