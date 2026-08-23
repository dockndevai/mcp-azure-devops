# Security & governance

`mcp-azure-devops` exposes Azure DevOps administration to an AI agent. Treat it
like any other privileged automation and grant it the least access it needs.

## Governance controls

- **Start read-only.** Leave `AZDO_MODE=read-only` until you need changes. Tools
  above the current mode are never registered.
- **Scope with the PAT, then with flags.** The PAT's own scopes are the primary
  control; use a read-only PAT to begin. `AZDO_PROJECT_ALLOWLIST` further limits
  which projects are reachable, and `AZDO_PROTECTED_PROJECTS` marks projects that
  can be read but never mutated.
- **Gate deletion explicitly.** `delete_project` requires `admin` mode **and**
  `AZDO_ALLOW_DELETE=true`.
- **Typed confirmation for high-impact ops.** With `AZDO_REQUIRE_CONFIRMATION=true`
  (default), `delete_project` also requires a `confirm` argument that exactly
  equals the project name — a boolean is not enough. This prevents an agent from
  deleting the wrong project on a loose instruction.
- **Preview with dry-run.** `AZDO_DRY_RUN=true` validates and logs write intent
  without calling Azure DevOps.
- **Keep the audit log on.** `AZDO_AUDIT_LOG=true` (default) writes a JSON line per
  guarded operation to stderr.

## Handling of credentials

- The PAT is read from the environment and sent only as the HTTP Basic auth header
  to `dev.azure.com`; it is never logged or returned in tool results.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a
public issue.
