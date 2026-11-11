import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { AppConfig } from "../src/config.js";
import { AzdoClient, AzdoError } from "../src/devops/client.js";
import { buildServer } from "../src/server.js";

const config = (requireHumanApproval = false, requireConfirmation = true): AppConfig => ({
  connection: { orgUrl: "https://dev.azure.com/org", pat: "p", apiVersion: "7.1", requestTimeout: 1000 },
  security: {
    mode: "admin",
    projectAllowlist: [],
    protectedProjects: [],
    allowDelete: true,
    requireConfirmation,
    dryRun: false,
    auditLog: false,
    requireHumanApproval,
  },
});

type Answer = { action: "accept" | "decline"; content?: Record<string, unknown> };

/** Connect an in-memory MCP client (optionally able to answer elicitation) to a freshly built server. */
async function connect(opts: {
  requireHuman?: boolean;
  requireConfirmation?: boolean;
  answer?: (message: string) => Answer | Promise<Answer>;
  elicits?: boolean;
}) {
  const { server } = buildServer(config(opts.requireHuman, opts.requireConfirmation));
  const prompts: string[] = [];
  const client = new Client({ name: "t", version: "0" }, { capabilities: opts.elicits === false ? {} : { elicitation: {} } });
  if (opts.elicits !== false) {
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      prompts.push(req.params.message);
      return (await opts.answer?.(req.params.message)) ?? { action: "accept", content: { confirm: true, typed: "Prod" } };
    });
  }
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, prompts };
}

const text = (r: unknown) => ((r as { content: Array<{ text: string }> }).content[0]?.text ?? "");
const DEL = { projectId: "11111111-1111-1111-1111-111111111111", projectName: "Prod", confirm: "Prod" };
const RUN = { project: "Prod", pipelineId: 7, branch: "main" };

/** Stubs for the backend: the project exists under the expected name. */
function stubProject(name = "Prod") {
  vi.spyOn(AzdoClient.prototype, "getProject").mockResolvedValue({ id: DEL.projectId, name });
  return vi.spyOn(AzdoClient.prototype, "deleteProject").mockResolvedValue(undefined);
}

afterEach(() => vi.restoreAllMocks());

describe("delete_project approval (end to end)", () => {
  it("shows the tool, full arguments, version and fingerprint, then deletes", async () => {
    vi.spyOn(AzdoClient.prototype, "projectVersion").mockResolvedValue("rev-1");
    const del = stubProject();
    const { client, prompts } = await connect({});
    const res = await client.callTool({ name: "delete_project", arguments: DEL });
    expect(text(res)).toContain('"deleted": true');
    expect(del).toHaveBeenCalledWith(DEL.projectId);
    expect(prompts[0]).toContain("tool: delete_project");
    expect(prompts[0]).toContain('"projectName":"Prod"');
    expect(prompts[0]).toContain(DEL.projectId);
    expect(prompts[0]).toContain("resource version: rev-1");
    expect(prompts[0]).toMatch(/fingerprint: [0-9a-f]{16}/);
  });

  it("does NOT delete when the project was edited while the human was deciding", async () => {
    const versions = ["rev-1", "rev-2"];
    vi.spyOn(AzdoClient.prototype, "projectVersion").mockImplementation(async () => versions.shift());
    const del = stubProject();
    const { client } = await connect({});
    const res = await client.callTool({ name: "delete_project", arguments: DEL });
    expect(text(res)).toContain("resource changed since the prompt");
    expect(del).not.toHaveBeenCalled();
  });

  it("does NOT delete when the human types the wrong project name", async () => {
    vi.spyOn(AzdoClient.prototype, "projectVersion").mockResolvedValue("rev-1");
    const del = stubProject();
    const { client } = await connect({ answer: () => ({ action: "accept", content: { confirm: true, typed: "Dev" } }) });
    const res = await client.callTool({ name: "delete_project", arguments: DEL });
    expect(text(res)).toContain("typed confirmation did not match");
    expect(del).not.toHaveBeenCalled();
  });

  it("does NOT delete when the human declines", async () => {
    vi.spyOn(AzdoClient.prototype, "projectVersion").mockResolvedValue("rev-1");
    const del = stubProject();
    const { client } = await connect({ answer: () => ({ action: "decline" }) });
    await client.callTool({ name: "delete_project", arguments: DEL });
    expect(del).not.toHaveBeenCalled();
  });

  it("keeps the model-supplied `confirm` argument gate: no prompt, no delete when it is wrong", async () => {
    const probe = vi.spyOn(AzdoClient.prototype, "projectVersion").mockResolvedValue("rev-1");
    const del = stubProject();
    const { client, prompts } = await connect({});
    const res = await client.callTool({ name: "delete_project", arguments: { ...DEL, confirm: "nope" } });
    expect(text(res)).toContain('Re-run with confirm="Prod"');
    expect(prompts).toHaveLength(0);
    expect(probe).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("still asks the human to type the name when AZDO_REQUIRE_CONFIRMATION=false", async () => {
    vi.spyOn(AzdoClient.prototype, "projectVersion").mockResolvedValue("rev-1");
    const del = stubProject();
    const { client, prompts } = await connect({
      requireConfirmation: false,
      answer: () => ({ action: "accept", content: { confirm: true, typed: "wrong" } }),
    });
    const res = await client.callTool({ name: "delete_project", arguments: { projectId: DEL.projectId, projectName: "Prod" } });
    expect(prompts).toHaveLength(1);
    expect(text(res)).toContain("typed confirmation did not match");
    expect(del).not.toHaveBeenCalled();
  });

  it("refuses, with no prompt, when projectId is not the project named by projectName", async () => {
    vi.spyOn(AzdoClient.prototype, "projectVersion").mockResolvedValue("rev-1");
    const del = stubProject("Staging");
    const { client, prompts } = await connect({});
    const res = await client.callTool({ name: "delete_project", arguments: DEL });
    expect(text(res)).toContain("is named 'Staging', not 'Prod'");
    expect(prompts).toHaveLength(0);
    expect(del).not.toHaveBeenCalled();
  });

  it("refuses when the project does not exist", async () => {
    vi.spyOn(AzdoClient.prototype, "getProject").mockRejectedValue(new AzdoError("nf", 404));
    const del = vi.spyOn(AzdoClient.prototype, "deleteProject").mockResolvedValue(undefined);
    const { client } = await connect({});
    const res = await client.callTool({ name: "delete_project", arguments: DEL });
    expect(text(res)).toContain("was not found");
    expect(del).not.toHaveBeenCalled();
  });
});

describe("AZDO_REQUIRE_HUMAN_APPROVAL", () => {
  it("falls back to the flags when the client cannot elicit (default)", async () => {
    vi.spyOn(AzdoClient.prototype, "projectVersion").mockResolvedValue("rev-1");
    const del = stubProject();
    const { client } = await connect({ elicits: false });
    await client.callTool({ name: "delete_project", arguments: DEL });
    expect(del).toHaveBeenCalledWith(DEL.projectId);
  });

  it("refuses to delete, without any prompt, when the client cannot elicit and a human is required", async () => {
    vi.spyOn(AzdoClient.prototype, "projectVersion").mockResolvedValue("rev-1");
    const del = stubProject();
    const { client, prompts } = await connect({ elicits: false, requireHuman: true });
    const res = await client.callTool({ name: "delete_project", arguments: DEL });
    expect(text(res)).toContain("no human approval channel");
    expect(prompts).toHaveLength(0);
    expect(del).not.toHaveBeenCalled();
  });

  it("refuses run_pipeline when the client cannot elicit and a human is required", async () => {
    vi.spyOn(AzdoClient.prototype, "pipelineVersion").mockResolvedValue("p1");
    const run = vi.spyOn(AzdoClient.prototype, "runPipeline").mockResolvedValue({});
    const { client } = await connect({ elicits: false, requireHuman: true });
    const res = await client.callTool({ name: "run_pipeline", arguments: RUN });
    expect(text(res)).toContain("no human approval channel");
    expect(run).not.toHaveBeenCalled();
  });
});

describe("run_pipeline binds the pipeline definition revision", () => {
  it("shows tool, args and version, then runs when the revision is stable", async () => {
    vi.spyOn(AzdoClient.prototype, "pipelineVersion").mockResolvedValue("p1");
    const run = vi.spyOn(AzdoClient.prototype, "runPipeline").mockResolvedValue({ id: 99 });
    const { client, prompts } = await connect({});
    const res = await client.callTool({ name: "run_pipeline", arguments: RUN });
    expect(text(res)).toContain('"id": 99');
    expect(run).toHaveBeenCalled();
    expect(prompts[0]).toContain("tool: run_pipeline");
    expect(prompts[0]).toContain('"pipelineId":7');
    expect(prompts[0]).toContain("resource version: p1");
    expect(prompts[0]).not.toContain("Type ");
  });

  it("does NOT run when the pipeline definition was edited while the human was deciding", async () => {
    const versions = ["p1", "p2"];
    vi.spyOn(AzdoClient.prototype, "pipelineVersion").mockImplementation(async () => versions.shift());
    const run = vi.spyOn(AzdoClient.prototype, "runPipeline").mockResolvedValue({});
    const { client } = await connect({});
    const res = await client.callTool({ name: "run_pipeline", arguments: RUN });
    expect(text(res)).toContain("resource changed since the prompt");
    expect(run).not.toHaveBeenCalled();
  });
});
