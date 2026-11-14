import { defaultMcpConfig, formatError, setupRepository } from "./setup.js";

const usage = `Usage:
  md-doc-search init [--repo <path>] [--mcp-config <path>] [--apply] [--force]

Preview setup by default. Pass --apply to write files.
Pass --force only after reviewing a conflict.
`;

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

export function main(args = process.argv.slice(2)) {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(usage);
    return 0;
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
