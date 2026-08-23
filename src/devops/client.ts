/**
 * Thin fetch-based client for the Azure DevOps REST API.
 * Auth is a Personal Access Token sent as HTTP Basic (username empty).
 * https://learn.microsoft.com/rest/api/azure/devops
 */
import type { AzdoConnection } from "../config.js";

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
