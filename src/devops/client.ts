/**
 * Thin fetch-based client for the Azure DevOps REST API.
 * Auth is a Personal Access Token sent as HTTP Basic (username empty).
 * https://learn.microsoft.com/rest/api/azure/devops
 */
import { createHash } from "node:crypto";
import type { AzdoConnection } from "../config.js";

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

export class AzdoError extends Error {
  constructor(message: string, readonly status: number, readonly body?: string) {
    super(message);
    this.name = "AzdoError";
  }
}

export class AzdoClient {
  private readonly authHeader: string;

  constructor(private readonly conn: AzdoConnection) {
    this.authHeader = `Basic ${Buffer.from(`:${conn.pat}`).toString("base64")}`;
  }

  /** Low-level request. `path` is appended to the org URL; api-version is added automatically. */
  async request<T = unknown>(
    method: string,
    path: string,
    opts: { query?: Record<string, string | number | undefined>; body?: unknown; contentType?: string } = {},
  ): Promise<T> {
    const url = new URL(`${this.conn.orgUrl}${path}`);
    if (!url.searchParams.has("api-version")) url.searchParams.set("api-version", this.conn.apiVersion);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.conn.requestTimeout);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          ...(opts.body !== undefined ? { "Content-Type": opts.contentType ?? "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new AzdoError(`Azure DevOps ${method} ${path} failed with ${res.status}.`, res.status, text);
      }
      return (text ? JSON.parse(text) : undefined) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private async getOrUndefined<T>(path: string): Promise<T | undefined> {
    try {
      return await this.request<T>("GET", path);
    } catch (err) {
      if (err instanceof AzdoError && err.status === 404) return undefined;
      throw err;
    }
  }

  // --- Version tokens (pinned across a human-approval prompt) ----------------
  /**
   * Project: id + the service's own `revision` + `lastUpdateTime` (both change when the project is
   * edited). `state` is excluded (it flips to `deleting` mid-operation). If a deployment returns neither
   * revision nor lastUpdateTime, falls back to id, name, description and visibility. NOT detected: changes
   * to the project's CONTENTS (repos, work items, pipelines) — those do not bump the project revision.
   */
  async projectVersion(projectId: string): Promise<string | undefined> {
    const p = await this.getOrUndefined<{
      id?: string;
      name?: string;
      description?: string;
      visibility?: string;
      revision?: number;
      lastUpdateTime?: string;
    }>(`/_apis/projects/${encodeURIComponent(projectId)}`);
    if (!p) return undefined;
    if (p.revision !== undefined || p.lastUpdateTime !== undefined) {
      return digest({ id: p.id ?? projectId, revision: p.revision ?? null, lastUpdateTime: p.lastUpdateTime ?? null });
    }
    return digest({ id: p.id ?? projectId, name: p.name, description: p.description, visibility: p.visibility });
  }

  /**
   * Pipeline definition: id + `revision` (increments on every definition edit). NOT detected: a change to the
   * YAML file in the repository (the revision tracks the pipeline definition, not the branch contents), or to
   * variables / service connections the run will consume.
   */
  async pipelineVersion(project: string, pipelineId: number): Promise<string | undefined> {
    const p = await this.getOrUndefined<{ id?: number; revision?: number; name?: string; folder?: string }>(
      `/${encodeURIComponent(project)}/_apis/pipelines/${pipelineId}`,
    );
    if (!p) return undefined;
    if (p.revision !== undefined) return digest({ id: p.id ?? pipelineId, revision: p.revision });
    return digest({ id: p.id ?? pipelineId, name: p.name, folder: p.folder });
  }

  // --- Projects / teams / process --------------------------------------------
  listProjects() {
    return this.request("GET", "/_apis/projects");
  }
  getProject(project: string) {
    return this.request("GET", `/_apis/projects/${encodeURIComponent(project)}`);
  }
  listTeams(project: string) {
    return this.request("GET", `/_apis/projects/${encodeURIComponent(project)}/teams`);
  }
  listTeamMembers(project: string, team: string) {
    return this.request(
      "GET",
      `/_apis/projects/${encodeURIComponent(project)}/teams/${encodeURIComponent(team)}/members`,
    );
  }
  listProcesses() {
    return this.request("GET", "/_apis/work/processes");
  }
  createProject(body: unknown) {
    return this.request("POST", "/_apis/projects", { body });
  }
  deleteProject(projectId: string) {
    return this.request("DELETE", `/_apis/projects/${encodeURIComponent(projectId)}`);
  }

  // --- Work items -------------------------------------------------------------
  queryWorkItems(project: string, wiql: string) {
    return this.request("POST", `/${encodeURIComponent(project)}/_apis/wit/wiql`, { body: { query: wiql } });
  }
  getWorkItem(id: number) {
    return this.request("GET", `/_apis/wit/workitems/${id}`, { query: { $expand: "fields" } });
  }
  createWorkItem(project: string, type: string, patch: Array<Record<string, unknown>>) {
    return this.request("POST", `/${encodeURIComponent(project)}/_apis/wit/workitems/$${encodeURIComponent(type)}`, {
      body: patch,
      contentType: "application/json-patch+json",
    });
  }
  updateWorkItem(id: number, patch: Array<Record<string, unknown>>) {
    return this.request("PATCH", `/_apis/wit/workitems/${id}`, {
      body: patch,
      contentType: "application/json-patch+json",
    });
  }
  listIterations(project: string, team: string) {
    return this.request(
      "GET",
      `/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/teamsettings/iterations`,
    );
  }

  // --- Repos / PRs ------------------------------------------------------------
  listRepositories(project: string) {
    return this.request("GET", `/${encodeURIComponent(project)}/_apis/git/repositories`);
  }
  listBranches(project: string, repo: string) {
    return this.request("GET", `/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}/refs`, {
      query: { filter: "heads/" },
    });
  }
  listPullRequests(project: string, repo: string, status: string) {
    return this.request(
      "GET",
      `/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullrequests`,
      { query: { "searchCriteria.status": status } },
    );
  }
  getPullRequest(project: string, repo: string, id: number) {
    return this.request(
      "GET",
      `/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullrequests/${id}`,
    );
  }
  createPullRequest(project: string, repo: string, body: unknown) {
    return this.request(
      "POST",
      `/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullrequests`,
      { body },
    );
  }

  // --- Pipelines / builds -----------------------------------------------------
  listPipelines(project: string) {
    return this.request("GET", `/${encodeURIComponent(project)}/_apis/pipelines`);
  }
  runPipeline(project: string, pipelineId: number, body: unknown) {
    return this.request("POST", `/${encodeURIComponent(project)}/_apis/pipelines/${pipelineId}/runs`, { body });
  }
  listBuilds(project: string, top: number) {
    return this.request("GET", `/${encodeURIComponent(project)}/_apis/build/builds`, {
      query: { $top: top, queryOrder: "finishTimeDescending" },
    });
  }
  getBuild(project: string, buildId: number) {
    return this.request("GET", `/${encodeURIComponent(project)}/_apis/build/builds/${buildId}`);
  }
}
