import { afterEach, describe, expect, it, vi } from "vitest";
import { AzdoClient } from "../src/devops/client.js";

const client = () => new AzdoClient({ orgUrl: "https://dev.azure.com/org", pat: "p", apiVersion: "7.1", requestTimeout: 1000 });
const json = (status: number, body: unknown) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

function stub(routes: Record<string, () => ReturnType<typeof json>>) {
  vi.stubGlobal("fetch", async (input: URL | string) => {
    const path = new URL(String(input)).pathname;
    const key = Object.keys(routes).find((k) => path.endsWith(k));
    return key ? routes[key]!() : json(404, { message: "TF200016: does not exist" });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("projectVersion", () => {
  const proj = (over: Record<string, unknown> = {}) => ({ id: "p1", name: "Prod", state: "wellFormed", revision: 5, lastUpdateTime: "2026-01-01T00:00:00Z", ...over });

  it("is stable across state flips and changes with revision or lastUpdateTime", async () => {
    stub({ "/projects/p1": () => json(200, proj()) });
    const a = await client().projectVersion("p1");
    stub({ "/projects/p1": () => json(200, proj({ state: "deleting" })) });
    expect(await client().projectVersion("p1")).toBe(a);
    stub({ "/projects/p1": () => json(200, proj({ revision: 6 })) });
    expect(await client().projectVersion("p1")).not.toBe(a);
    stub({ "/projects/p1": () => json(200, proj({ lastUpdateTime: "2026-02-01T00:00:00Z" })) });
    expect(await client().projectVersion("p1")).not.toBe(a);
  });

  it("falls back to content fields when the service returns no revision", async () => {
    stub({ "/projects/p1": () => json(200, { id: "p1", name: "Prod", description: "a" }) });
    const a = await client().projectVersion("p1");
    stub({ "/projects/p1": () => json(200, { id: "p1", name: "Prod", description: "b" }) });
    expect(await client().projectVersion("p1")).not.toBe(a);
  });

  it("returns undefined on 404 and throws on other errors", async () => {
    stub({});
    expect(await client().projectVersion("gone")).toBeUndefined();
    stub({ "/projects/p1": () => json(500, {}) });
    await expect(client().projectVersion("p1")).rejects.toThrow();
  });
});

describe("pipelineVersion", () => {
  it("tracks the definition revision", async () => {
    stub({ "/pipelines/7": () => json(200, { id: 7, revision: 3, name: "ci" }) });
    const a = await client().pipelineVersion("Prod", 7);
    stub({ "/pipelines/7": () => json(200, { id: 7, revision: 3, name: "renamed" }) });
    expect(await client().pipelineVersion("Prod", 7)).toBe(a);
    stub({ "/pipelines/7": () => json(200, { id: 7, revision: 4, name: "ci" }) });
    expect(await client().pipelineVersion("Prod", 7)).not.toBe(a);
  });

  it("returns undefined when the pipeline does not exist", async () => {
    stub({});
    expect(await client().pipelineVersion("Prod", 8)).toBeUndefined();
  });
});
