#!/usr/bin/env node
// inventory.mjs — read-only inventory for a build-to-support-team handoff.
//
// Reads the repository and reports the harness, agents, skills, source areas,
// documentation, and any references to paths the caller is considering
// retiring. It never writes or deletes anything.
//
// Usage:
//   node scripts/inventory.mjs --repo <repo> [--harness-root .agents]
//                              [--retire <path>]... [--json]

import path from "node:path";
import {
  buildRepoMap,
  classifyAgents,
  classifySkills,
  docFiles,
  isClean,
  isGitRepo,
  isHistorical,
  normalizePlanPath,
  resolveHarness,
  scanDangling,
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

const blocking = [];
const warnings = [];
const requested = [];
for (const value of valuesFor("--retire")) {
  try {
    requested.push(normalizePlanPath(value));
  } catch (error) {
    blocking.push(error.message);
  }
}

if (!isGitRepo(repo)) {
  warnings.push("Not a git repository. Apply will require --allow-no-git and will archive only.");
}
if (isGitRepo(repo) && !isClean(repo)) {
  warnings.push("Working tree is not clean. Commit or stash before applying, or pass --allow-dirty.");
}

const harnessResult = resolveHarness(repo, valueFor("--harness-root"));
if (harnessResult.error) warnings.push(harnessResult.error);
if (harnessResult.selected?.create) {
  warnings.push(`Harness '${harnessResult.selected.rootRel}' does not exist yet; generation will create it.`);
}

const harness = harnessResult.selected;
const agents = harness ? classifyAgents(repo, harness) : [];
const skills = harness ? classifySkills(repo, harness) : [];
for (const agent of agents) {
  for (const issue of agent.issues) warnings.push(`${agent.path}: ${issue}`);
}
for (const skill of skills) {
  for (const issue of skill.issues) warnings.push(`${skill.path}: ${issue}`);
}

const dangling = requested.length > 0
  ? scanDangling(repo, harness, {
      retire: requested,
      retireSkills: [],
      retiredAgents: [],
      preservedDocs: [],
    })
  : [];

const repoMap = buildRepoMap(repo);
const docs = docFiles(repo).map((file) => ({ path: file, historical: isHistorical(file) }));
const tests = testDirectories(repo);

const plan = {
  version: 1,
  repo,
  harness: {
    selected: harness?.rootRel ?? null,
    candidates: harnessResult.candidates.map((candidate) => candidate.rootRel),
    agents: harness?.agentsRel ?? null,
    skills: harness?.skillsRel ?? null,
    error: harnessResult.error,
  },
  preflight: { blocking, warnings },
  hasAgents: agents.length > 0,
  agents,
  skills,
  requestedRetire: requested,
  dangling,
  repoMap,
  docs,
  workspaces: repoMap.workspaces,
  tests,
  summary: {
    agents: agents.length,
    skills: skills.length,
    sourceAreas: repoMap.sourceDirectories.length,
    workspaces: repoMap.workspaces.length,
    docs: docs.length,
    requestedRetire: requested.length,
    dangling: dangling.length,
  },
};

if (hasFlag("--json")) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  process.exit(0);
}

const lines = [];
lines.push("# Support team handoff inventory");
lines.push("");
lines.push(`Repository: \`${repo}\``);
lines.push(`Harness: ${harness ? `\`${harness.rootRel}\`` : "_not selected_"}`);
lines.push(`Candidates: ${harnessResult.candidates.map((candidate) => `\`${candidate.rootRel}\``).join(", ") || "_none_"}`);
lines.push("");
if (blocking.length > 0) {
  lines.push("## Blocking");
  for (const item of blocking) lines.push(`- ${item}`);
  lines.push("");
}
if (warnings.length > 0) {
  lines.push("## Warnings");
  for (const item of warnings) lines.push(`- ${item}`);
  lines.push("");
}
lines.push("## Agents");
if (agents.length === 0) lines.push("_No agents found._");
for (const agent of agents) {
  const scopes = agent.scopes.length > 0 ? agent.scopes.map((scope) => `\`${scope}\``).join(", ") : "_no scope_";
  lines.push(`- \`${agent.path}\` — ${agent.name || "unnamed"} — ${scopes}`);
}
lines.push("");
lines.push("## Skills");
if (skills.length === 0) lines.push("_No skills found._");
for (const skill of skills) lines.push(`- \`${skill.path}\` — ${skill.name || "unnamed"}`);
lines.push("");
lines.push("## Source areas");
lines.push(repoMap.sourceDirectories.map((dir) => `- \`${dir}\``).join("\n") || "_None detected._");
lines.push("");
lines.push("## Workspaces");
lines.push(repoMap.workspaces.map((dir) => `- \`${dir}\``).join("\n") || "_None detected._");
lines.push("");
lines.push("## Tests");
const testPaths = [...tests.dirs, ...tests.files];
lines.push(testPaths.map((file) => `- \`${file}\``).join("\n") || "_None detected._");
lines.push("");
lines.push("## CI");
lines.push(repoMap.ci.map((file) => `- \`${file}\``).join("\n") || "_None detected._");
lines.push("");
lines.push("## Manifests");
lines.push(repoMap.manifests.map((file) => `- \`${file}\``).join("\n") || "_None detected._");
lines.push("");
lines.push("## Documentation");
lines.push(docs.map((doc) => `- \`${doc.path}\`${doc.historical ? " — historical" : ""}`).join("\n") || "_None detected._");
lines.push("");
if (requested.length > 0) {
  lines.push("## Requested retirement");
  for (const file of requested) lines.push(`- \`${file}\``);
  lines.push("");
  lines.push("## References to requested retirement");
  if (dangling.length === 0) lines.push("_None found._");
  for (const finding of dangling) {
    lines.push(`- \`${finding.path}:${finding.line}\` — ${finding.marker} — ${finding.text}`);
  }
  lines.push("");
}
lines.push("## Summary");
lines.push(
  `${agents.length} agent(s), ${skills.length} skill(s), ${repoMap.sourceDirectories.length} source area(s), ` +
    `${repoMap.workspaces.length} workspace package(s), ${docs.length} document(s).`,
);
if (requested.length > 0) {
  lines.push(`${requested.length} requested retirement path(s), ${dangling.length} reference(s) to rewrite.`);
}
process.stdout.write(`${lines.join("\n")}\n`);
