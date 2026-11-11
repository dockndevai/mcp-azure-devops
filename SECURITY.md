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
- **Require a human for destructive and high-impact ops.** Set `AZDO_REQUIRE_HUMAN_APPROVAL=true`
  so `delete_project` and `run_pipeline` are refused when the client cannot show an approval
  prompt. Each approval is bound to the exact tool and arguments (fingerprint) and to the target's
  version: for a project, its id with the service's `revision` and `lastUpdateTime` (contents such
  as repos or work items do not bump these); for a pipeline, its id and definition `revision` (a
  change to the YAML file in the repository does not). If the target changed while the human was
  deciding, the action is refused. `delete_project` also verifies that `projectId` really is the
  project named by `projectName` (the name drives the protected-project and allowlist checks) and
  asks the human to type the project name. That typed prompt is separate from the `confirm` tool
  argument: `confirm` is supplied by the model and checked by policy before anything is shown (and
  needs `AZDO_REQUIRE_CONFIRMATION=true`); the typed prompt is answered by the human and is asked
  whenever the client can elicit. Approval receipts are written to the audit log
  (`"audit":"approval"`, with `approvedBy` = `human` or `flag-only`). A prompt nobody answers is a
  refusal.
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
