import type { AccessMode, SecurityConfig } from "./security.js";

export interface AzdoConnection {
  /** Organization URL, e.g. https://dev.azure.com/my-org */
  orgUrl: string;
  /** Personal Access Token (used as HTTP basic auth). */
  pat: string;
  apiVersion: string;
  requestTimeout: number;
}

export interface AppConfig {
  connection: AzdoConnection;
  security: SecurityConfig;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function list(name: string): string[] {
  const v = process.env[name];
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseMode(): AccessMode {
  const raw = (process.env.AZDO_MODE ?? "read-only").toLowerCase();
  if (raw === "read-only" || raw === "read-write" || raw === "admin") return raw;
  throw new Error(`Invalid AZDO_MODE '${raw}'. Expected one of: read-only, read-write, admin.`);
}

export function loadConfig(): AppConfig {
  // Fall back to placeholders so the server can start and advertise its tools
  // (introspection); API calls fail only when a tool is actually invoked.
  const org = process.env.AZDO_ORG_URL || (process.env.AZDO_ORG ? `https://dev.azure.com/${process.env.AZDO_ORG}` : "https://dev.azure.com/your-org");
  const pat = process.env.AZDO_PAT ?? "";
  if (!process.env.AZDO_ORG_URL && !process.env.AZDO_ORG) {
    process.stderr.write("[azure-devops-mcp] WARNING: AZDO_ORG_URL/AZDO_ORG not set; using a placeholder org.\n");
  }
  if (!pat) {
    process.stderr.write("[azure-devops-mcp] WARNING: AZDO_PAT not set; tool calls will fail until provided.\n");
  }
  return {
    connection: {
      orgUrl: org.replace(/\/+$/, ""),
      pat,
      apiVersion: process.env.AZDO_API_VERSION || "7.1",
      requestTimeout: Number(process.env.AZDO_TIMEOUT_MS ?? 20000),
    },
    security: {
      mode: parseMode(),
      projectAllowlist: list("AZDO_PROJECT_ALLOWLIST"),
      protectedProjects: list("AZDO_PROTECTED_PROJECTS"),
      allowDelete: bool("AZDO_ALLOW_DELETE", false),
      requireConfirmation: bool("AZDO_REQUIRE_CONFIRMATION", true),
      dryRun: bool("AZDO_DRY_RUN", false),
      auditLog: bool("AZDO_AUDIT_LOG", true),
    },
  };
}
