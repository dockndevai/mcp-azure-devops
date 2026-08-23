import { describe, expect, it } from "vitest";
import { PolicyError, SecurityPolicy, type SecurityConfig } from "../src/security.js";

function makePolicy(overrides: Partial<SecurityConfig> = {}): SecurityPolicy {
  return new SecurityPolicy({
    mode: "read-only",
    projectAllowlist: [],
    protectedProjects: [],
    allowDelete: false,
    requireConfirmation: true,
    dryRun: false,
    auditLog: false,
    ...overrides,
  });
}

describe("capability gating", () => {
  it("read-only enables read only", () => {
    const p = makePolicy();
    expect(p.isCapabilityEnabled("read")).toBe(true);
    expect(p.isCapabilityEnabled("write")).toBe(false);
    expect(p.isCapabilityEnabled("admin")).toBe(false);
  });
});

describe("project allowlist + protection", () => {
  it("blocks projects outside a non-empty allowlist", () => {
    const p = makePolicy({ mode: "read-write", projectAllowlist: ["Payments"] });
    expect(() => p.guard({ tool: "list_repositories", capability: "read", project: "Secret" })).toThrow(/allowlist/);
    expect(() => p.guard({ tool: "list_repositories", capability: "read", project: "Payments" })).not.toThrow();
  });
  it("allows reading a protected project but not mutating it", () => {
    const p = makePolicy({ mode: "admin", allowDelete: true, protectedProjects: ["Core"] });
    expect(() => p.guard({ tool: "get_project", capability: "read", project: "Core" })).not.toThrow();
    expect(() => p.guard({ tool: "create_work_item", capability: "write", project: "Core" })).toThrow(/protected/);
  });
});

describe("destructive gating", () => {
  it("blocks delete without allowDelete", () => {
    const p = makePolicy({ mode: "admin" });
    expect(() =>
      p.guard({ tool: "delete_project", capability: "admin", project: "X", destructive: true, confirmExpected: "X", confirmProvided: "X" }),
    ).toThrow(/ALLOW_DELETE/);
  });
});

describe("high-impact confirmation", () => {
  it("refuses when the typed confirmation does not match", () => {
    const p = makePolicy({ mode: "admin", allowDelete: true });
    expect(() =>
      p.guard({ tool: "delete_project", capability: "admin", project: "Prod", destructive: true, confirmExpected: "Prod", confirmProvided: "prod" }),
    ).toThrow(/confirm="Prod"/);
  });
  it("proceeds when the confirmation matches", () => {
    const p = makePolicy({ mode: "admin", allowDelete: true });
    expect(() =>
      p.guard({ tool: "delete_project", capability: "admin", project: "Prod", destructive: true, confirmExpected: "Prod", confirmProvided: "Prod" }),
    ).not.toThrow();
  });
  it("can be disabled via requireConfirmation=false", () => {
    const p = makePolicy({ mode: "admin", allowDelete: true, requireConfirmation: false });
    expect(() =>
      p.guard({ tool: "delete_project", capability: "admin", project: "Prod", destructive: true, confirmExpected: "Prod", confirmProvided: undefined }),
    ).not.toThrow();
  });
});

describe("dry run", () => {
  it("flags writes but not reads", () => {
    const p = makePolicy({ mode: "read-write", dryRun: true });
    expect(p.guard({ tool: "get_project", capability: "read", project: "X" }).dryRun).toBe(false);
    expect(p.guard({ tool: "create_work_item", capability: "write", project: "X" }).dryRun).toBe(true);
  });
});
