# MCP Client Configuration

Use this guidance when the selected MCP client does not consume the generated repository `.mcp.json` directly.

The CLI writes a repository-level JSON object using this `mcpServers` entry:

```json
{
  "mcpServers": {
    "md-doc-search": {
      "command": "python3",
      "args": ["/absolute/path/to/repository/scripts/md_mcp_server.py"]
    }
  }
}
```

On Windows, the generated command is `python`. The script resolves its repository root from its own location, and the absolute path prevents launch-directory ambiguity. This is a generic configuration shape, not a guarantee that every MCP host reads `.mcp.json` or accepts identical fields.

When adapting it:

1. Read the selected client's current documentation for repository-local stdio MCP servers.
2. Preserve the command and script argument, translating only the surrounding config schema/path expected by that client.
3. Keep the script argument absolute if the client has no supported working-directory field. If the config is committed, note that the path is checkout-specific.
4. Do not edit global client configuration without explicit user approval.
5. Restart/reload the MCP host and confirm that `search_docs` and `read_doc_section` are listed.
