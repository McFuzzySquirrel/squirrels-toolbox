import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

export const agentsBegin = "<!-- md-doc-search:begin -->";
export const agentsEnd = "<!-- md-doc-search:end -->";
export const mcpServerName = "md-doc-search";
export const defaultMcpConfig = ".mcp.json";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptTemplates = [
  ["scripts/md_index.py", "md_index.py"],
  ["scripts/md_mcp_server.py", "md_mcp_server.py"],
];
const decoder = new TextDecoder("utf-8", { fatal: true });

export class SetupConflictError extends Error {}

function assertInsideRepo(repo, target) {
  const relative = path.relative(repo, target);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new SetupConflictError(`Refusing to write outside the target repository: ${target}`);
  }

  let current = repo;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        throw new SetupConflictError(`Refusing to write through a symlink: ${current}`);
      }
    } catch (error) {
      if (error instanceof SetupConflictError) throw error;
      if (error.code === "ENOENT") break;
      throw error;
    }
  }
}

function readText(filePath, label) {
  try {
    return decoder.decode(fs.readFileSync(filePath));
  } catch (error) {
    if (error instanceof TypeError) {
      throw new SetupConflictError(`${label} is not valid UTF-8; refusing to replace it`);
    }
    throw error;
  }
}

function updateAgents(existing) {
  const hasBegin = existing.includes(agentsBegin);
  const hasEnd = existing.includes(agentsEnd);
  if (
    hasBegin !== hasEnd ||
    existing.split(agentsBegin).length > 2 ||
    existing.split(agentsEnd).length > 2
  ) {
    throw new SetupConflictError("AGENTS.md has incomplete or duplicate md-doc-search markers");
  }

  const section = `${agentsBegin}
## Documentation Lookup Protocol
For large reference documents (>300 lines), use \`search_docs\` to locate relevant sections, then \`read_doc_section\` with the returned \`file_path\`, \`start_line\`, and \`end_line\`.
For instruction files such as \`AGENTS.md\`, \`SKILL.md\`, and custom agent definitions, follow the normal instruction-loading process. Search may help locate them, but search results must not replace the full applicable instructions.
${agentsEnd}`;
  if (hasBegin) {
    const start = existing.indexOf(agentsBegin);
    const endMarker = existing.indexOf(agentsEnd);
    if (endMarker < start) {
      throw new SetupConflictError("AGENTS.md md-doc-search markers are out of order");
    }
    return `${existing.slice(0, start)}${section}${existing.slice(endMarker + agentsEnd.length)}`;
  }
  if (!existing) return `${section}\n`;
  const separator = existing.endsWith("\n") ? "" : "\n";
  return `${existing}${separator}\n${section}\n`;
}

function updateGitignore(existing) {
  const lines = existing.split(/\r?\n/);
  if (lines.includes("/.docs_index.sqlite") || lines.includes(".docs_index.sqlite")) {
    return existing;
  }
  const separator = !existing || existing.endsWith("\n") ? "" : "\n";
  return `${existing}${separator}/.docs_index.sqlite\n`;
}

function updateMcpConfig(existing, scriptPath, force) {
  let config = {};
  if (existing !== undefined) {
    try {
      config = JSON.parse(decoder.decode(existing));
    } catch {
      throw new SetupConflictError("MCP config is not valid UTF-8 JSON; refusing to replace it");
    }
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new SetupConflictError("MCP config must contain a JSON object");
    }
  }

  if (!Object.hasOwn(config, "mcpServers")) {
    config.mcpServers = {};
  }
  if (!config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) {
    throw new SetupConflictError("MCP config field 'mcpServers' must be a JSON object");
  }

  const command = process.platform === "win32" ? "python" : "python3";
  const expected = { command, args: [scriptPath] };
  const hasCurrent = Object.hasOwn(config.mcpServers, mcpServerName);
  const current = config.mcpServers[mcpServerName];
  const isExpected =
    current &&
    typeof current === "object" &&
    !Array.isArray(current) &&
    current.command === expected.command &&
    Array.isArray(current.args) &&
    current.args.length === 1 &&
    current.args[0] === scriptPath &&
    Object.keys(current).length === 2;
  if (hasCurrent && !isExpected && !force) {
    throw new SetupConflictError(
      `MCP config already has an unrecognized '${mcpServerName}' entry; use --force to replace it`,
    );
  }
  config.mcpServers[mcpServerName] = expected;
  return `${JSON.stringify(config, null, 2)}\n`;
}

function prepareChanges(repo, mcpConfig, force) {
  const changes = [];
  for (const [relative, templateName] of scriptTemplates) {
    const target = path.join(repo, relative);
    assertInsideRepo(repo, target);
    const content = fs.readFileSync(path.join(packageRoot, "templates", templateName));
    if (fs.existsSync(target)) {
      if (!fs.statSync(target).isFile()) {
        throw new SetupConflictError(`Cannot install script over non-file path: ${relative}`);
      }
      const current = fs.readFileSync(target);
      if (current.equals(content)) continue;
      if (!force) {
        throw new SetupConflictError(`${relative} already exists and is not managed; use --force to replace it`);
      }
    }
    changes.push({ target, content });
  }

  const agentsPath = path.join(repo, "AGENTS.md");
  assertInsideRepo(repo, agentsPath);
  if (fs.existsSync(agentsPath) && !fs.statSync(agentsPath).isFile()) {
    throw new SetupConflictError("AGENTS.md exists but is not a regular file");
  }
  const agents = fs.existsSync(agentsPath) ? readText(agentsPath, "AGENTS.md") : "";
  const updatedAgents = updateAgents(agents);
  if (updatedAgents !== agents) changes.push({ target: agentsPath, content: Buffer.from(updatedAgents) });

  const gitignorePath = path.join(repo, ".gitignore");
  assertInsideRepo(repo, gitignorePath);
  if (fs.existsSync(gitignorePath) && !fs.statSync(gitignorePath).isFile()) {
    throw new SetupConflictError(".gitignore exists but is not a regular file");
  }
  const gitignore = fs.existsSync(gitignorePath) ? readText(gitignorePath, ".gitignore") : "";
  const updatedGitignore = updateGitignore(gitignore);
  if (updatedGitignore !== gitignore) changes.push({ target: gitignorePath, content: Buffer.from(updatedGitignore) });

  const requestedConfig = path.isAbsolute(mcpConfig) ? path.resolve(mcpConfig) : path.resolve(repo, mcpConfig);
  assertInsideRepo(repo, requestedConfig);
  if (fs.existsSync(requestedConfig) && !fs.statSync(requestedConfig).isFile()) {
    throw new SetupConflictError(`MCP config path is not a file: ${path.relative(repo, requestedConfig)}`);
  }
  const currentConfig = fs.existsSync(requestedConfig) ? fs.readFileSync(requestedConfig) : undefined;
  const updatedConfig = updateMcpConfig(
    currentConfig,
    path.join(repo, "scripts/md_mcp_server.py"),
    force,
  );
  if (currentConfig === undefined || !currentConfig.equals(Buffer.from(updatedConfig))) {
    changes.push({ target: requestedConfig, content: Buffer.from(updatedConfig) });
  }
  return changes;
}

function atomicWrite(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const mode = fs.existsSync(target) ? fs.statSync(target).mode & 0o777 : 0o644;
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.md-doc-search-${randomUUID()}`);
  try {
    fs.writeFileSync(temporary, content, { flag: "wx", mode });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function setupRepository({
  repoPath = process.cwd(),
  mcpConfig = defaultMcpConfig,
  apply = false,
  force = false,
} = {}) {
  let repo;
  try {
    repo = fs.realpathSync(path.resolve(repoPath));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Target repository directory does not exist: ${path.resolve(repoPath)}`);
    }
    throw error;
  }
  if (!fs.statSync(repo).isDirectory()) {
    throw new Error(`Target repository path is not a directory: ${repo}`);
  }
  if (typeof mcpConfig !== "string" || !mcpConfig) {
    throw new TypeError("MCP config path must be a non-empty string");
  }

  const changesToApply = prepareChanges(repo, mcpConfig, force);
  const changes = changesToApply.map(({ target }) => ({
    path: path.relative(repo, target).split(path.sep).join("/"),
    action: fs.existsSync(target) ? "update" : "create",
  }));
  if (apply) {
    for (const { target, content } of changesToApply) atomicWrite(target, content);
  }
  return { repo, changes, applied: apply };
}

export function formatError(error) {
  if (error instanceof SetupConflictError) return error.message;
  if (error.code === "EACCES" || error.code === "EPERM") {
    return `${error.message}. Check write permissions for the target repository.`;
  }
  return error.message || String(error);
}
