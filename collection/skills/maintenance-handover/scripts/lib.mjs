import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const SKILL_NAME = "maintenance-handover";
export const HARNESS_ROOTS = [".agents", ".opencode", ".claude", ".github"];
export const GENERATED_DIRS = [".handoff", ".handoff-archive"];
export const PLAN_PATH = ".handoff/plan.json";

const SOURCE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".kts", ".cs", ".fs",
  ".c", ".h", ".cc", ".cpp", ".hpp", ".m", ".mm", ".swift",
  ".php", ".ex", ".exs", ".erl", ".hrl", ".clj", ".scala", ".dart",
  ".sh", ".ps1", ".sql", ".graphql", ".proto",
]);

const IGNORED_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", "coverage", ".next", ".nuxt",
  ".cache", ".turbo", "vendor", "target", "bin", "obj", ".venv", "venv",
  "__pycache__", ".handoff", ".handoff-archive",
]);

const WORKSPACE_DIRS = ["packages", "apps", "crates", "modules"];
const TEST_DIR_NAMES = new Set(["test", "tests", "__tests__", "spec", "specs", "e2e"]);

const MANIFEST_NAMES = new Set([
  "package.json", "pyproject.toml", "setup.py", "setup.cfg", "Cargo.toml",
  "go.mod", "pom.xml", "build.gradle", "build.gradle.kts", "composer.json",
  "Gemfile", "mix.exs", "pubspec.yaml", "Makefile", "justfile", "Taskfile.yml",
  "docker-compose.yml", "compose.yaml", "Dockerfile",
]);

const HISTORICAL_PREFIXES = [
  "docs/adr/",
  "docs/research/",
  "docs/releases/",
  "docs/updates.md",
  "docs/the-story",
  "changelog",
  ".handoff/",
  ".handoff-archive/",
];

const ROOT_PROTECTED_FILES = new Set([
  "readme",
  "readme.md",
  "license",
  "license.md",
  "license.txt",
  "architecture",
  "architecture.md",
  "contributing",
  "contributing.md",
  "changelog",
  "changelog.md",
  "agents.md",
  "claude.md",
  "security",
  "security.md",
  "code_of_conduct",
  "code_of_conduct.md",
  ".gitignore",
]);

const PROTECTED_BASENAMES = new Set([
  ...MANIFEST_NAMES,
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "tsconfig.json",
  "jsconfig.json",
].map((name) => name.toLowerCase()));

const ALWAYS_PROTECTED_PATHS = new Set([
  "docs/support.md",
]);

const PROTECTED_PREFIXES = [
  "docs/adr/",
  "docs/research/",
  "docs/releases/",
  "docs/updates.md",
  "docs/the-story",
  ".github/workflows/",
  ".git/",
  "node_modules/",
  ".handoff/",
  ".handoff-archive/",
];

export function posix(value) {
  return value.split(path.sep).join("/");
}

export function rel(repo, absolute) {
  return posix(path.relative(repo, absolute));
}

export function exists(repo, relativePath) {
  return fs.existsSync(path.join(repo, relativePath));
}

export function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.slice(1).findIndex((line) => line.trim() === "---");
  if (end < 0) return null;
  const data = {};
  const errors = [];
  for (let index = 1; index <= end; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (/^\s/.test(line)) {
      errors.push(`line ${index + 1}: frontmatter continuation is not supported`);
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 1) {
      errors.push(`line ${index + 1}: invalid frontmatter field`);
      continue;
    }
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1).trim();
    data[key] = raw;
  }
  return { data, errors, body: lines.slice(end + 2).join("\n") };
}

export function unquote(value) {
  return String(value ?? "").replace(/^["']|["']$/g, "");
}

export function git(repo, args) {
  try {
    return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

export function isGitRepo(repo) {
  return git(repo, ["rev-parse", "--show-toplevel"]) !== null;
}

export function isClean(repo) {
  const status = git(repo, ["status", "--porcelain"]);
  if (status === null) return false;
  const relevant = status
    .split("\n")
    .map((line) => line.slice(3).trim().replace(/^"|"$/g, ""))
    .filter((value) => value.length > 0)
    .filter((value) => !GENERATED_DIRS.some((dir) => value === dir || value.startsWith(`${dir}/`)));
  return relevant.length === 0;
}

export function isHistorical(relativePath) {
  const value = posix(relativePath).toLowerCase();
  if (path.posix.basename(value).startsWith("changelog")) return true;
  return HISTORICAL_PREFIXES.some((prefix) => value === prefix || value.startsWith(prefix));
}

export function globToRegExp(pattern) {
  let normalized = posix(pattern).replace(/^\.\//, "").replace(/\/+$/, "");
  if (normalized === "**") return /^.*$/;
  if (normalized.endsWith("/**")) normalized = normalized.slice(0, -3);
  let expression = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === "*" && normalized[index + 1] === "*") {
      expression += ".*";
      index += 1;
      if (normalized[index + 1] === "/") index += 1;
    } else if (char === "*") {
      expression += "[^/]*";
    } else if (char === "?") {
      expression += "[^/]";
    } else {
      expression += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${expression}(?:/.*)?$`);
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listDirs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !IGNORED_DIRS.has(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function listFilesIn(dir, predicate = () => true) {
  const found = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && predicate(full)) found.push(full);
    }
  }
  return found.sort();
}

function hasFiles(dir, predicate) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .some((entry) => entry.isFile() && predicate(entry.name));
  } catch {
    return false;
  }
}

function hasSource(dir) {
  return listFilesIn(dir, (file) => SOURCE_EXTS.has(path.extname(file).toLowerCase())).length > 0;
}

export function sourceDirectories(repo) {
  const harnessNames = new Set(HARNESS_ROOTS.map((root) => root.replace(/^\./, "")));
  const ignoredTop = new Set([...harnessNames, "docs", "src", ...WORKSPACE_DIRS]);
  const dirs = new Set();

  const src = path.join(repo, "src");
  if (fs.existsSync(src)) {
    if (hasFiles(src, (name) => SOURCE_EXTS.has(path.extname(name).toLowerCase()))) dirs.add("src");
    for (const name of listDirs(src)) {
      if (hasSource(path.join(src, name))) dirs.add(`src/${name}`);
    }
  }

  for (const name of listDirs(repo)) {
    if (name.startsWith(".") || ignoredTop.has(name)) continue;
    if (hasSource(path.join(repo, name))) dirs.add(name);
  }

  for (const workspace of WORKSPACE_DIRS) {
    for (const name of listDirs(path.join(repo, workspace))) {
      const packageDir = path.join(repo, workspace, name);
      const packageSrc = path.join(packageDir, "src");
      if (fs.existsSync(packageSrc) && hasSource(packageSrc)) dirs.add(`${workspace}/${name}/src`);
      else if (hasSource(packageDir)) dirs.add(`${workspace}/${name}`);
    }
  }

  return [...dirs].sort();
}

export function testDirectories(repo) {
  const dirs = new Set();
  for (const name of listDirs(repo)) {
    if (TEST_DIR_NAMES.has(name)) dirs.add(name);
  }
  for (const name of listDirs(path.join(repo, "src"))) {
    if (TEST_DIR_NAMES.has(name)) dirs.add(`src/${name}`);
  }
  for (const workspace of WORKSPACE_DIRS) {
    for (const packageName of listDirs(path.join(repo, workspace))) {
      for (const name of listDirs(path.join(repo, workspace, packageName))) {
        if (TEST_DIR_NAMES.has(name)) dirs.add(`${workspace}/${packageName}/${name}`);
      }
    }
  }
  const files = listFilesIn(repo, (file) => /\.(test|spec)\.[^.]+$/i.test(file))
    .map((file) => rel(repo, file))
    .slice(0, 50);
  return { dirs: [...dirs].sort(), files };
}

export function ciFiles(repo) {
  const candidates = [
    ".github/workflows",
    ".gitlab-ci.yml",
    ".circleci/config.yml",
    "azure-pipelines.yml",
    "bitbucket-pipelines.yml",
    "Jenkinsfile",
  ];
  const found = [];
  for (const candidate of candidates) {
    const absolute = path.join(repo, candidate);
    if (!fs.existsSync(absolute)) continue;
    if (fs.statSync(absolute).isDirectory()) {
      for (const file of listFilesIn(absolute)) found.push(rel(repo, file));
    } else {
      found.push(candidate);
    }
  }
  return found.sort();
}

export function repoManifests(repo) {
  const found = [];
  for (const name of fs.readdirSync(repo)) {
    if (MANIFEST_NAMES.has(name)) found.push(name);
  }
  for (const workspace of WORKSPACE_DIRS) {
    for (const name of listDirs(path.join(repo, workspace))) {
      for (const manifest of MANIFEST_NAMES) {
        const candidate = `${workspace}/${name}/${manifest}`;
        if (fs.existsSync(path.join(repo, candidate))) found.push(candidate);
      }
    }
  }
  return [...new Set(found)].sort();
}

export function configFiles(repo) {
  const names = new Set([
    ...MANIFEST_NAMES,
    "tsconfig.json",
    "jsconfig.json",
  ]);
  const found = [];
  for (const name of fs.readdirSync(repo)) {
    if (names.has(name) || /\.config\.(js|mjs|cjs|ts|json)$/i.test(name)) found.push(name);
  }
  for (const file of ciFiles(repo)) {
    if (/\.(ya?ml|json)$/i.test(file)) found.push(file);
  }
  return [...new Set(found)].sort();
}

export function packageScripts(repo) {
  const value = readJson(path.join(repo, "package.json"), {});
  return value && typeof value.scripts === "object" && value.scripts ? value.scripts : {};
}

export function docFiles(repo) {
  return listFilesIn(path.join(repo, "docs"), (file) => /\.(md|mdx)$/i.test(file))
    .map((file) => rel(repo, file))
    .sort();
}

export function buildRepoMap(repo) {
  return {
    topLevel: fs
      .readdirSync(repo, { withFileTypes: true })
      .filter((entry) => !IGNORED_DIRS.has(entry.name) && entry.name !== ".git")
      .map((entry) => `${entry.name}${entry.isDirectory() ? "/" : ""}`)
      .sort(),
    manifests: repoManifests(repo),
    sourceDirectories: sourceDirectories(repo),
    workspaces: WORKSPACE_DIRS.flatMap((workspace) =>
      listDirs(path.join(repo, workspace)).map((name) => `${workspace}/${name}`),
    ).sort(),
    tests: testDirectories(repo),
    ci: ciFiles(repo),
    scripts: packageScripts(repo),
    docs: docFiles(repo),
  };
}

export function findHarnessRoots(repo) {
  const found = [];
  for (const root of HARNESS_ROOTS) {
    const rootAbs = path.join(repo, root);
    const agentsAbs = path.join(rootAbs, "agents");
    const skillsAbs = path.join(rootAbs, "skills");
    if (fs.existsSync(agentsAbs) || fs.existsSync(skillsAbs)) {
      found.push({
        rootRel: root,
        agentsRel: `${root}/agents`,
        skillsRel: `${root}/skills`,
        agentsAbs,
        skillsAbs,
      });
    }
  }
  const rootAgents = path.join(repo, "agents");
  const rootSkills = path.join(repo, "skills");
  if (fs.existsSync(rootAgents) || fs.existsSync(rootSkills)) {
    found.push({
      rootRel: ".",
      agentsRel: "agents",
      skillsRel: "skills",
      agentsAbs: rootAgents,
      skillsAbs: rootSkills,
    });
  }
  return found;
}

function normalizeHarnessRoot(value) {
  const normalized = posix(String(value)).replace(/^\.\//, "").replace(/\/+$/, "") || ".";
  if (normalized === "root" || normalized === "agents" || normalized === "skills") return ".";
  return normalized;
}

export function resolveHarness(repo, explicit = undefined) {
  const candidates = findHarnessRoots(repo);
  if (explicit) {
    const rootRel = normalizeHarnessRoot(explicit);
    const match = candidates.find((candidate) => candidate.rootRel === rootRel);
    if (match) return { selected: match, candidates, error: null, explicit: true };
    if (rootRel !== "." && !HARNESS_ROOTS.includes(rootRel)) {
      return { selected: null, candidates, error: `unknown harness root '${explicit}'`, explicit: true };
    }
    const rootAbs = rootRel === "." ? repo : path.join(repo, rootRel);
    if (fs.existsSync(rootAbs) && !fs.statSync(rootAbs).isDirectory()) {
      return { selected: null, candidates, error: `harness root '${explicit}' is not a directory`, explicit: true };
    }
    return {
      selected: {
        rootRel,
        agentsRel: rootRel === "." ? "agents" : `${rootRel}/agents`,
        skillsRel: rootRel === "." ? "skills" : `${rootRel}/skills`,
        agentsAbs: path.join(rootAbs, "agents"),
        skillsAbs: path.join(rootAbs, "skills"),
        create: true,
      },
      candidates,
      error: null,
      explicit: true,
    };
  }
  if (candidates.length === 1) return { selected: candidates[0], candidates, error: null, explicit: false };
  if (candidates.length === 0) {
    return { selected: null, candidates, error: "no agent harness found; pass --harness-root", explicit: false };
  }
  return { selected: null, candidates, error: "multiple agent harnesses found; pass --harness-root", explicit: false };
}

export function agentFiles(repo, harness) {
  if (!harness) return [];
  try {
    return fs
      .readdirSync(harness.agentsAbs, { withFileTypes: true })
      .filter((entry) => {
        if (!entry.isFile() || !entry.name.endsWith(".md")) return false;
        const name = entry.name.toLowerCase();
        return name !== "skill.md" && name !== "readme.md" && name !== "agents.md";
      })
      .map((entry) => path.join(harness.agentsAbs, entry.name))
      .sort();
  } catch {
    return [];
  }
}

export function skillDirs(repo, harness) {
  if (!harness) return [];
  try {
    return fs
      .readdirSync(harness.skillsAbs, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, dir: path.join(harness.skillsAbs, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export function extractScopePaths(text) {
  const match = /^##\s+Scope\s*$/im.exec(text);
  if (!match) return [];
  const rest = text.slice(match.index + match[0].length);
  const end = /^##\s+/m.exec(rest);
  const section = end ? rest.slice(0, end.index) : rest;
  const paths = [];
  for (const token of section.matchAll(/`([^`]+)`/g)) {
    const value = token[1].trim().replace(/^\.\//, "").replace(/\/+$/, "");
    if (!value) continue;
    if (/^[a-z]+:\/\//i.test(value)) continue;
    if (/\s/.test(value)) continue;
    if (value.startsWith("-")) continue;
    paths.push(value.replace(/\/\*\*$/, ""));
  }
  return [...new Set(paths)];
}

export function scopePathExists(repo, scope) {
  const prefix = scope.split(/[*?]/)[0].replace(/\/+$/, "");
  if (!prefix) return true;
  return fs.existsSync(path.join(repo, prefix));
}

export function classifyAgents(repo, harness) {
  return agentFiles(repo, harness).map((file) => {
    const relativePath = rel(repo, file);
    const text = readText(file);
    const parsed = parseFrontmatter(text);
    const name = parsed ? unquote(parsed.data.name) : "";
    const description = parsed ? unquote(parsed.data.description) : "";
    const scopes = parsed ? extractScopePaths(parsed.body) : [];
    const issues = [];
    if (!parsed) {
      issues.push("missing or unterminated frontmatter");
    } else {
      for (const error of parsed.errors) issues.push(error);
      if (!name) issues.push("missing name");
      if (name && name !== path.basename(file, ".md")) {
        issues.push(`name '${name}' does not match filename`);
      }
      if (!description) issues.push("missing description");
      if (scopes.length === 0) issues.push("missing ## Scope with backticked paths");
      for (const scope of scopes) {
        if (!scopePathExists(repo, scope)) issues.push(`scope path does not exist: ${scope}`);
      }
    }
    return { path: relativePath, name, description, scopes, issues };
  });
}

export function classifySkills(repo, harness) {
  return skillDirs(repo, harness).map((skill) => {
    const relativePath = rel(repo, skill.dir);
    const skillFile = path.join(skill.dir, "SKILL.md");
    const text = readText(skillFile);
    const parsed = parseFrontmatter(text);
    const name = parsed ? unquote(parsed.data.name) : "";
    const description = parsed ? unquote(parsed.data.description) : "";
    const issues = [];
    if (!fs.existsSync(skillFile)) {
      issues.push("skill directory has no SKILL.md");
    } else if (!parsed) {
      issues.push("missing or unterminated frontmatter");
    } else {
      for (const error of parsed.errors) issues.push(error);
      if (!name) issues.push("missing name");
      if (name && name !== skill.name) issues.push(`name '${name}' does not match directory`);
      if (!description) issues.push("missing description");
    }
    return { name: skill.name, path: relativePath, description, issues };
  });
}

export function isProtectedPath(relativePath, sourceDirs = [], testDirs = []) {
  const value = posix(relativePath).replace(/^\.\//, "").replace(/\/+$/, "");
  const lower = value.toLowerCase();
  if (!value) return true;
  if (ALWAYS_PROTECTED_PATHS.has(lower)) return true;
  if (!value.includes("/") && ROOT_PROTECTED_FILES.has(lower)) return true;
  if (PROTECTED_BASENAMES.has(path.posix.basename(lower))) return true;
  if (lower.startsWith("changelog") || lower.includes("/changelog")) return true;
  if (PROTECTED_PREFIXES.some((prefix) => lower === prefix.replace(/\/$/, "") || lower.startsWith(prefix))) return true;
  if (value.includes(`/skills/${SKILL_NAME}`) || value === `skills/${SKILL_NAME}`) return true;
  for (const dir of sourceDirs) {
    if (value === dir || value.startsWith(`${dir}/`)) return true;
  }
  for (const dir of testDirs) {
    if (value === dir || value.startsWith(`${dir}/`)) return true;
  }
  return false;
}

export function containsProtectedPath(repo, relativePath, sourceDirs = [], testDirs = []) {
  if (isProtectedPath(relativePath, sourceDirs, testDirs)) return true;
  const absolute = path.join(repo, relativePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) return false;
  return listFilesIn(absolute).some((file) => isProtectedPath(rel(repo, file), sourceDirs, testDirs));
}

export function normalizePlanPath(value) {
  const normalized = posix(String(value)).replace(/^\.\//, "").replace(/\/+$/, "");
  if (!normalized || normalized === "." || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`invalid plan path: ${value}`);
  }
  return normalized;
}

export function loadPlan(repo, planPath = PLAN_PATH) {
  const absolute = path.isAbsolute(planPath) ? planPath : path.join(repo, planPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`plan not found: ${posix(path.relative(repo, absolute))}`);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(absolute, "utf8"));
  } catch (error) {
    throw new Error(`plan is not valid JSON: ${error.message}`);
  }
  if (data.version !== 1) throw new Error("plan version must be 1");
  if (!["convert", "generate"].includes(data.mode)) {
    throw new Error("plan mode must be 'convert' or 'generate'");
  }
  const list = (key) => (Array.isArray(data[key]) ? [...new Set(data[key].map(normalizePlanPath))] : []);
  const plan = {
    version: 1,
    mode: data.mode,
    harnessRoot: typeof data.harnessRoot === "string" ? data.harnessRoot : null,
    retire: list("retire"),
    retireSkills: list("retireSkills"),
    retiredAgents: list("retiredAgents"),
    preservedDocs: list("preservedDocs"),
    rewrite: list("rewrite"),
    keep: list("keep"),
    generatedAgents: Array.isArray(data.generatedAgents) ? data.generatedAgents : [],
    createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
  };
  for (const key of ["retire", "retireSkills", "retiredAgents", "preservedDocs"]) {
    for (const item of plan[key]) {
      if (/[*?]/.test(item)) throw new Error(`${key} paths must be concrete: ${item}`);
    }
  }
  return plan;
}

export function activeFilesForScan(repo, harness, plan) {
  const files = new Set();
  const preserved = new Set(plan.preservedDocs ?? []);
  for (const doc of docFiles(repo)) {
    if (isHistorical(doc) || preserved.has(doc)) continue;
    files.add(path.join(repo, doc));
  }
  for (const name of ["README.md", "AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md", "ARCHITECTURE.md"]) {
    if (preserved.has(name)) continue;
    if (fs.existsSync(path.join(repo, name))) files.add(path.join(repo, name));
  }
  for (const config of configFiles(repo)) files.add(path.join(repo, config));
  if (harness) {
    for (const file of agentFiles(repo, harness)) files.add(file);
    for (const skill of skillDirs(repo, harness)) {
      if (skill.name === SKILL_NAME) continue;
      const skillFile = path.join(skill.dir, "SKILL.md");
      if (fs.existsSync(skillFile)) files.add(skillFile);
    }
  }
  return [...files].sort();
}

export function scanDangling(repo, harness, plan) {
  const markers = [];
  for (const retired of plan.retire) markers.push({ label: retired, pattern: new RegExp(escapeRegExp(retired), "i") });
  for (const retired of plan.retireSkills) {
    const name = path.posix.basename(retired);
    markers.push({ label: retired, pattern: new RegExp(escapeRegExp(name), "i") });
  }
  for (const retired of plan.retiredAgents) {
    const name = path.posix.basename(retired, ".md");
    markers.push({ label: retired, pattern: new RegExp(`\\b${escapeRegExp(name)}\\b`, "i") });
  }
  const findings = [];
  for (const file of activeFilesForScan(repo, harness, plan)) {
    const relativePath = rel(repo, file);
    const lines = readText(file).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      for (const marker of markers) {
        if (!marker.pattern.test(lines[index])) continue;
        findings.push({
          path: relativePath,
          line: index + 1,
          marker: marker.label,
          text: lines[index].trim(),
        });
      }
    }
  }
  return findings;
}

export function coverage(repo, agentPaths) {
  const sourceDirs = sourceDirectories(repo);
  const testInfo = testDirectories(repo);
  const known = new Set([
    ...sourceDirs,
    ...testInfo.dirs,
    ...testInfo.files,
    ...ciFiles(repo),
    ...configFiles(repo),
    ...repoManifests(repo),
    ...docFiles(repo),
    "docs",
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    "CONTRIBUTING.md",
    "ARCHITECTURE.md",
  ]);
  const scopes = agentPaths.map((relativePath) => ({
    path: relativePath,
    scopes: extractScopePaths(readText(path.join(repo, relativePath))),
  }));
  const covers = (scope, knownPath) => {
    const pattern = globToRegExp(scope);
    if (pattern.test(knownPath)) return true;
    const absolute = path.join(repo, knownPath);
    try {
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) return false;
      return listFilesIn(absolute).some((file) => pattern.test(rel(repo, file)));
    } catch {
      return false;
    }
  };
  const uncovered = sourceDirs.filter(
    (dir) => !scopes.some((entry) => entry.scopes.some((scope) => covers(scope, dir))),
  );
  const ownerless = scopes.filter((entry) => entry.scopes.length === 0).map((entry) => entry.path);
  const irrelevant = scopes
    .filter((entry) => entry.scopes.length > 0)
    .filter((entry) => !entry.scopes.some((scope) => [...known].some((knownPath) => covers(scope, knownPath))))
    .map((entry) => entry.path);
  return { sourceDirs, uncovered, ownerless, irrelevant };
}

export function ensureGitignore(repo) {
  const file = path.join(repo, ".gitignore");
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lines = existing.split(/\r?\n/).map((line) => line.trim());
  const entries = [".handoff/", ".handoff-archive/"];
  const missing = entries.filter((entry) => !lines.includes(entry) && !lines.includes(entry.replace(/\/$/, "")));
  if (missing.length === 0) return { changed: false, added: [] };
  const block = ["# maintenance-handover", ...missing].join("\n");
  const next = existing.trimEnd() ? `${existing.trimEnd()}\n\n${block}\n` : `${block}\n`;
  fs.writeFileSync(file, next);
  return { changed: true, added: missing };
}
