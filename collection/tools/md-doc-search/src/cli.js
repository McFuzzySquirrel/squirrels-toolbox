import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultMcpConfig, formatError, setupRepository } from "./setup.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundledIndexerPath = path.join(packageRoot, "templates", "md_index.py");

const usage = `Usage:
  md-doc-search init [--repo <path>] [--mcp-config <path>] [--apply] [--force]
  md-doc-search search <query> [--repo <path>] [-k <limit>] [--json]
  md-doc-search status [--repo <path>] [--json]
  md-doc-search index [--repo <path>] [--force] [--json]
  md-doc-search read <file_path> --start-line <n> --end-line <n> [--repo <path>] [--json]
  md-doc-search doctor [--repo <path>] [--mcp-config <path>] [--json]

Operational commands accept --python <executable> to select a Python interpreter.
Preview setup by default. Pass --apply to write files.
Pass --force only after reviewing a conflict.
`;

function extractPythonOption(args) {
  const commandArgs = [];
  let python;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--python") {
      commandArgs.push(args[index]);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error("--python requires an executable path");
    if (python !== undefined) throw new Error("--python may only be specified once");
    python = value;
    index += 1;
  }
  return {
    args: commandArgs,
    python: python ?? (process.platform === "win32" ? "python" : "python3"),
  };
}

function parseStatusArgs(args) {
  const options = { repoPath: process.cwd(), json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--repo") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--repo requires a path");
      options.repoPath = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function parseSearchArgs(args) {
  const query = args[0];
  if (!query || query.startsWith("--")) throw new Error("search requires a query");
  const options = { query, repoPath: process.cwd(), limit: 5, json: false };
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--repo" || arg === "-k" || arg === "--limit") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      if (arg === "--repo") {
        options.repoPath = value;
      } else {
        options.limit = Number(value);
        if (!Number.isInteger(options.limit) || options.limit < 1) {
          throw new Error(`${arg} must be a positive integer`);
        }
      }
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function parseIndexArgs(args) {
  const options = { repoPath: process.cwd(), force: false, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--repo") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--repo requires a path");
      options.repoPath = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function parseReadArgs(args) {
  const filePath = args[0];
  if (!filePath || filePath.startsWith("--")) throw new Error("read requires a Markdown file path");
  const options = { filePath, repoPath: process.cwd(), startLine: undefined, endLine: undefined, json: false };
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--repo" || arg === "--start-line" || arg === "--end-line") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      if (arg === "--repo") {
        options.repoPath = value;
      } else {
        const line = Number(value);
        if (!Number.isInteger(line) || line < 1) throw new Error(`${arg} must be a positive integer`);
        if (arg === "--start-line") options.startLine = line;
        else options.endLine = line;
      }
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (options.startLine === undefined || options.endLine === undefined) {
    throw new Error("read requires both --start-line and --end-line");
  }
  return options;
}

function parseDoctorArgs(args) {
  const options = { repoPath: process.cwd(), mcpConfig: defaultMcpConfig, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--repo" || arg === "--mcp-config") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a path`);
      if (arg === "--repo") options.repoPath = value;
      else options.mcpConfig = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function parseInitArgs(args) {
  const options = { repoPath: process.cwd(), mcpConfig: defaultMcpConfig, apply: false, force: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--repo" || arg === "--mcp-config") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a path`);
      if (arg === "--repo") options.repoPath = value;
      else options.mcpConfig = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function runIndexer(repoPath, args, python, scriptPath) {
  const repo = fs.realpathSync(path.resolve(repoPath));
  if (!fs.statSync(repo).isDirectory()) throw new Error(`Target repository path is not a directory: ${repo}`);
  const indexerPath = scriptPath ?? path.join(repo, "scripts", "md_index.py");
  if (!fs.existsSync(indexerPath) || !fs.statSync(indexerPath).isFile()) {
    if (scriptPath) throw new Error(`Bundled indexer script is missing: ${indexerPath}`);
    throw new Error(`md-doc-search is not initialized in ${repo}; run "md-doc-search init --apply" first.`);
  }
  const result = spawnSync(python, [indexerPath, ...args], { cwd: repo, encoding: "utf8" });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error(`Python interpreter "${python}" was not found; pass --python <executable> to select one.`);
    }
    throw result.error;
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

export function main(args = process.argv.slice(2)) {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(usage);
    return 0;
  }

  if (args[0] === "search") {
    try {
      const { args: rawArgs, python } = extractPythonOption(args.slice(1));
      const options = parseSearchArgs(rawArgs);
      const commandArgs = [
        "search",
        options.query,
        "-k",
        String(options.limit),
        "--dir",
        path.resolve(options.repoPath),
      ];
      if (options.json) commandArgs.push("--json");
      return runIndexer(options.repoPath, commandArgs, python);
    } catch (error) {
      process.stderr.write(`Error: ${formatError(error)}\n`);
      return 2;
    }
  }

  if (args[0] === "index") {
    try {
      const { args: rawArgs, python } = extractPythonOption(args.slice(1));
      const options = parseIndexArgs(rawArgs);
      const commandArgs = ["index", "--dir", path.resolve(options.repoPath)];
      if (options.force) commandArgs.push("--force");
      if (options.json) commandArgs.push("--json");
      return runIndexer(options.repoPath, commandArgs, python);
    } catch (error) {
      process.stderr.write(`Error: ${formatError(error)}\n`);
      return 2;
    }
  }

  if (args[0] === "read") {
    try {
      const { args: rawArgs, python } = extractPythonOption(args.slice(1));
      const options = parseReadArgs(rawArgs);
      const commandArgs = [
        "read",
        options.filePath,
        "--start-line",
        String(options.startLine),
        "--end-line",
        String(options.endLine),
        "--dir",
        path.resolve(options.repoPath),
      ];
      if (options.json) commandArgs.push("--json");
      return runIndexer(options.repoPath, commandArgs, python);
    } catch (error) {
      process.stderr.write(`Error: ${formatError(error)}\n`);
      return 2;
    }
  }

  if (args[0] === "doctor") {
    try {
      const { args: rawArgs, python } = extractPythonOption(args.slice(1));
      const options = parseDoctorArgs(rawArgs);
      const repo = fs.realpathSync(path.resolve(options.repoPath));
      if (!fs.statSync(repo).isDirectory()) throw new Error(`Target repository path is not a directory: ${repo}`);
      const indexerPath = path.join(repo, "scripts", "md_index.py");
      const installedIndexerPath = fs.existsSync(indexerPath) && fs.statSync(indexerPath).isFile()
        ? indexerPath
        : bundledIndexerPath;
      const commandArgs = [
        "doctor",
        "--dir",
        repo,
        "--mcp-config",
        options.mcpConfig,
      ];
      if (options.json) commandArgs.push("--json");
      return runIndexer(options.repoPath, commandArgs, python, installedIndexerPath);
    } catch (error) {
      process.stderr.write(`Error: ${formatError(error)}\n`);
      return 2;
    }
  }

  if (args[0] === "status") {
    try {
      const { args: rawArgs, python } = extractPythonOption(args.slice(1));
      const options = parseStatusArgs(rawArgs);
      const commandArgs = ["status", "--dir", path.resolve(options.repoPath)];
      if (options.json) commandArgs.push("--json");
      return runIndexer(options.repoPath, commandArgs, python);
    } catch (error) {
      process.stderr.write(`Error: ${formatError(error)}\n`);
      return 2;
    }
  }

  if (args[0] !== "init") {
    process.stderr.write(`Expected the "init" command.\n\n${usage}`);
    return 2;
  }

  try {
    const result = setupRepository(parseInitArgs(args.slice(1)));
    if (result.changes.length === 0) {
      process.stdout.write(`No changes needed in ${result.repo}.\n`);
      return 0;
    }
    const verb = result.applied ? "Applied" : "Would apply";
    process.stdout.write(`${verb} ${result.changes.length} change(s) in ${result.repo}:\n`);
    for (const change of result.changes) {
      process.stdout.write(`  ${change.action}: ${change.path}\n`);
    }
    if (!result.applied) process.stdout.write("Re-run with --apply to write these changes.\n");
    return 0;
  } catch (error) {
    process.stderr.write(`Error: ${formatError(error)}\n`);
    return 2;
  }
}
