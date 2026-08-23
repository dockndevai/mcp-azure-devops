# mcp-azure-devops

[![CI](https://github.com/dockndevai/mcp-azure-devops/actions/workflows/ci.yml/badge.svg)](https://github.com/dockndevai/mcp-azure-devops/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/@dockndevai/mcp-azure-devops)](https://www.npmjs.com/package/@dockndevai/mcp-azure-devops)

A [Model Context Protocol](https://modelcontextprotocol.io) server for **Azure DevOps**. It lets an MCP-capable client (Claude Desktop, Claude Code, Cursor, Codex, …) work across **boards, repos, pipelines, and projects** — with a governance layer that keeps an AI agent inside safe boundaries.

## What this offers

- **Projects & teams** — list projects/teams/members, inspect process templates.
- **Boards / work items** — WIQL queries, get work items, create/update work items, list iterations (sprints).
- **Repos / pull requests** — list repositories and branches, list/get PRs, open PRs.
- **Pipelines / builds** — list pipelines and recent builds, get a build, queue a run.
- **Admin / process** — list process templates, create a project, delete a project (guarded).
- **Governance built in** — access modes, project allowlists, protected projects, delete gating, typed confirmation for high-impact ops, dry-run, and JSON audit logging.

## Governance & security model

| Concern | Flag | Default | Effect |
| --- | --- | --- | --- |
| What can the server do? | `AZDO_MODE` | `read-only` | `read-only` → reads; `read-write` → work items, PRs, pipeline runs; `admin` → create/delete project. Tools above the mode are **never registered**. |
| Which projects are in scope? | `AZDO_PROJECT_ALLOWLIST` | *(all)* | Operations on other projects are refused. |
| Which projects are read-only forever? | `AZDO_PROTECTED_PROJECTS` | *(none)* | Readable, never mutable. |
| Can it delete? | `AZDO_ALLOW_DELETE` | `false` | `delete_project` needs this **and** admin mode. |
| Typed confirmation | `AZDO_REQUIRE_CONFIRMATION` | `true` | High-impact ops require `confirm` to equal the target name — not just a boolean. |
| Preview | `AZDO_DRY_RUN` | `false` | Write/admin tools validate + log intent, then return. |
| Audit trail | `AZDO_AUDIT_LOG` | `true` | JSON line to stderr per guarded operation. |

## Tools

**Read** (`read-only`+): `list_projects`, `get_project`, `list_teams`, `list_team_members`, `list_processes`, `query_work_items`, `get_work_item`, `list_iterations`, `list_repositories`, `list_branches`, `list_pull_requests`, `get_pull_request`, `list_pipelines`, `list_builds`, `get_build`

**Write** (`read-write`+): `create_work_item`, `update_work_item`, `create_pull_request`, `run_pipeline`

**Admin** (`admin`): `create_project`, `delete_project` (needs `AZDO_ALLOW_DELETE` + typed `confirm`)

## Quickstart — add to your agent

Published on npm as [`@dockndevai/mcp-azure-devops`](https://www.npmjs.com/package/@dockndevai/mcp-azure-devops). Runs via `npx`; needs an org and a PAT. See [docs/CLIENTS.md](docs/CLIENTS.md) for every client and [`.env.example`](.env.example) for all variables.

**Claude Code**

```bash
claude mcp add azure-devops -e AZDO_ORG_URL="https://dev.azure.com/your-org" -e AZDO_PAT="your-pat" -e AZDO_MODE="read-only" -- npx -y @dockndevai/mcp-azure-devops
```

**Claude Desktop · Cursor · Windsurf**

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "npx",
      "args": ["-y", "@dockndevai/mcp-azure-devops"],
      "env": {
        "AZDO_ORG_URL": "https://dev.azure.com/your-org",
        "AZDO_PAT": "your-pat",
        "AZDO_MODE": "read-only"
      }
    }
  }
}
```

## Example prompts

- *"List active pull requests in the Payments project's api repo"*
- *"Query work items assigned to me that are still Active"*
- *"Show the last 10 builds in the Web project and which failed"*
- *"Create a Bug in Payments titled 'Checkout 500 on retry'"* (needs read-write)

## Run from source (development)

```bash
npm install
npm run build
node dist/index.js   # with the environment variables set
```

## Develop

```bash
npm run dev
npm test          # governance policy: modes, allowlists, delete gating, confirmation
npm run typecheck
```

## Publishing

Ships a [`server.json`](server.json) for the official MCP registry and an [`mcpName`](package.json) for npm ownership validation. See **[PUBLISHING.md](PUBLISHING.md)**.

## License

MIT
