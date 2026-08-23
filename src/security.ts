/**
 * Governance & security policy engine.
 *
 * On top of the shared model (access modes + capability gating + allowlists +
 * protected resources + delete gating + dry-run + audit), this server adds two
 * governance controls suited to Azure DevOps:
 *   - Project scoping: an allowlist of projects, plus protected projects that can
 *     be read but never mutated.
 *   - High-impact confirmation: destructive operations must echo back the exact
 *     target name (a typed confirmation), not just a boolean, before they run.
 *
 * Pure logic, no I/O — fully unit-testable.
 */

export type Capability = "read" | "write" | "admin";
export type AccessMode = "read-only" | "read-write" | "admin";

const MODE_RANK: Record<AccessMode, number> = { "read-only": 0, "read-write": 1, admin: 2 };
const CAPABILITY_RANK: Record<Capability, number> = { read: 0, write: 1, admin: 2 };

export interface SecurityConfig {
  mode: AccessMode;
  /** If set, only these projects may be touched. Empty = all. */
  projectAllowlist: string[];
  /** Projects that can be read but never mutated or deleted. */
  protectedProjects: string[];
  /** Destructive delete_* operations require this. */
  allowDelete: boolean;
  /** High-impact (destructive) operations require a typed confirmation match. */
  requireConfirmation: boolean;
  /** Validate + log writes without sending them to Azure DevOps. */
  dryRun: boolean;
  auditLog: boolean;
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export interface GuardContext {
  tool: string;
  capability: Capability;
  /** Project the operation targets, if any. */
  project?: string;
  /** Destructive delete operation — needs allowDelete. */
  destructive?: boolean;
  /** For high-impact ops: the exact value the caller must type to confirm. */
  confirmExpected?: string;
  /** The confirmation the caller actually provided. */
  confirmProvided?: string;
}

export class SecurityPolicy {
  constructor(private readonly config: SecurityConfig) {}

  get mode(): AccessMode {
    return this.config.mode;
  }

  isCapabilityEnabled(capability: Capability): boolean {
    return CAPABILITY_RANK[capability] <= MODE_RANK[this.config.mode];
  }

  isProjectAllowed(project: string): boolean {
    if (this.config.projectAllowlist.length === 0) return true;
    return this.config.projectAllowlist.includes(project);
  }

  isProjectProtected(project: string): boolean {
    return this.config.protectedProjects.includes(project);
  }

  guard(ctx: GuardContext): { dryRun: boolean } {
    if (!this.isCapabilityEnabled(ctx.capability)) {
      this.audit(ctx, "DENY", `capability '${ctx.capability}' exceeds mode '${this.config.mode}'`);
      throw new PolicyError(
        `Operation '${ctx.tool}' requires '${ctx.capability}' access but the server runs in '${this.config.mode}' mode.`,
      );
    }

    if (ctx.project !== undefined) {
      if (!this.isProjectAllowed(ctx.project)) {
        this.audit(ctx, "DENY", `project '${ctx.project}' not in allowlist`);
        throw new PolicyError(
          `Project '${ctx.project}' is not in the configured allowlist (AZDO_PROJECT_ALLOWLIST).`,
        );
      }
      if (ctx.capability !== "read" && this.isProjectProtected(ctx.project)) {
        this.audit(ctx, "DENY", `project '${ctx.project}' is protected`);
        throw new PolicyError(
          `Project '${ctx.project}' is protected (AZDO_PROTECTED_PROJECTS); mutations are refused.`,
        );
      }
    }

    if (ctx.destructive && !this.config.allowDelete) {
      this.audit(ctx, "DENY", "delete not enabled");
      throw new PolicyError(
        `Destructive operation '${ctx.tool}' is disabled. Set AZDO_ALLOW_DELETE=true to enable it.`,
      );
    }

    // Governance: typed confirmation for high-impact operations.
    if (ctx.destructive && this.config.requireConfirmation && ctx.confirmExpected !== undefined) {
      if (ctx.confirmProvided !== ctx.confirmExpected) {
        this.audit(ctx, "DENY", "confirmation mismatch");
        throw new PolicyError(
          `Operation '${ctx.tool}' is high-impact. Re-run with confirm="${ctx.confirmExpected}" to proceed.`,
        );
      }
    }

    const dryRun = ctx.capability !== "read" && this.config.dryRun;
    this.audit(ctx, dryRun ? "DRY_RUN" : "ALLOW");
    return { dryRun };
  }

  private audit(ctx: GuardContext, decision: string, reason?: string): void {
    if (!this.config.auditLog) return;
    const line = {
      ts: new Date().toISOString(),
      audit: "azure-devops-mcp",
      decision,
      tool: ctx.tool,
      capability: ctx.capability,
      project: ctx.project ?? null,
      destructive: ctx.destructive ?? false,
      ...(reason ? { reason } : {}),
    };
    process.stderr.write(`${JSON.stringify(line)}\n`);
  }
}
