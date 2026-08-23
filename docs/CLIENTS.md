# Installing `@dockndevai/mcp-azure-devops` in your MCP client

A **stdio** MCP server. Published on npm — your MCP client runs it with `npx` (no clone needed), or run from a local build. **Start in `read-only` mode.** See [`.env.example`](../.env.example) for every variable.

## Claude Code (CLI)

```bash
claude mcp add azure-devops -e AZDO_ORG_URL="https://dev.azure.com/your-org" -e AZDO_PAT="your-pat" -e AZDO_MODE="read-only" -- npx -y @dockndevai/mcp-azure-devops
```

## Claude Desktop · Cursor · Windsurf

Merge into `claude_desktop_config.json`, `.cursor/mcp.json`, or `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "npx",
      "args": [
        "-y",
        "@dockndevai/mcp-azure-devops"
      ],
      "env": {
        "AZDO_ORG_URL": "https://dev.azure.com/your-org",
        "AZDO_PAT": "your-pat",
        "AZDO_MODE": "read-only"
      }
    }
  }
}
```

## OpenAI Codex CLI (`~/.codex/config.toml`)

```toml
[mcp_servers.azure-devops]
command = "npx"
args = ["-y", "@dockndevai/mcp-azure-devops"]
env = { AZDO_ORG_URL = "https://dev.azure.com/your-org", AZDO_PAT = "your-pat", AZDO_MODE = "read-only" }
```

## VS Code (GitHub Copilot, Agent mode) — `.vscode/mcp.json`

```json
{
  "servers": {
    "azure-devops": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@dockndevai/mcp-azure-devops"
      ],
      "env": {
        "AZDO_ORG_URL": "https://dev.azure.com/your-org",
        "AZDO_PAT": "your-pat",
        "AZDO_MODE": "read-only"
      }
    }
  }
}
```

## From a local build

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/mcp-azure-devops/dist/index.js"
      ],
      "env": {
        "AZDO_ORG_URL": "https://dev.azure.com/your-org",
        "AZDO_PAT": "your-pat",
        "AZDO_MODE": "read-only"
      }
    }
  }
}
```

## Verify

On startup the server logs to **stderr**: `[azure-devops-mcp] Starting in 'read-only' mode. N tools enabled: …`. Ask your agent to list the Azure DevOps tools to confirm.
