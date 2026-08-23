import { z } from "zod";
import type { ToolDef } from "./types.js";
import { jsonResult } from "./types.js";

export const readTools: ToolDef[] = [
  {
    name: "list_projects",
    capability: "read",
    config: { title: "List projects", description: "List projects in the organization (filtered by the allowlist).", inputSchema: {} },
    handler: async (_a, { client, policy }) => {
      policy.guard({ tool: "list_projects", capability: "read" });
      const data = (await client.listProjects()) as { value?: Array<{ name: string; id: string; state: string }> };
      const projects = (data.value ?? [])
        .filter((p) => policy.isProjectAllowed(p.name))
        .map((p) => ({ id: p.id, name: p.name, state: p.state, protected: policy.isProjectProtected(p.name) }));
      return jsonResult(projects);
    },
  },
  {
    name: "get_project",
    capability: "read",
    config: {
      title: "Get project",
      description: "Fetch details of a single project.",
      inputSchema: { project: z.string().describe("Project name or id") },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      policy.guard({ tool: "get_project", capability: "read", project });
      return jsonResult(await client.getProject(project));
    },
  },
  {
    name: "list_teams",
    capability: "read",
    config: {
      title: "List teams",
      description: "List teams in a project.",
      inputSchema: { project: z.string().describe("Project name or id") },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      policy.guard({ tool: "list_teams", capability: "read", project });
      return jsonResult(await client.listTeams(project));
    },
  },
  {
    name: "list_team_members",
    capability: "read",
    config: {
      title: "List team members",
      description: "List the members of a team.",
      inputSchema: { project: z.string(), team: z.string().describe("Team id or name") },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      policy.guard({ tool: "list_team_members", capability: "read", project });
      return jsonResult(await client.listTeamMembers(project, a.team as string));
    },
  },
  {
    name: "list_processes",
    capability: "read",
    config: { title: "List processes", description: "List organization process templates (Agile, Scrum, CMMI, inherited).", inputSchema: {} },
    handler: async (_a, { client, policy }) => {
      policy.guard({ tool: "list_processes", capability: "read" });
      return jsonResult(await client.listProcesses());
    },
  },
  {
    name: "query_work_items",
    capability: "read",
    config: {
      title: "Query work items (WIQL)",
      description: "Run a WIQL query and return matching work item ids. Example: SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Active'.",
      inputSchema: { project: z.string(), wiql: z.string().describe("A WIQL query string") },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      policy.guard({ tool: "query_work_items", capability: "read", project });
      return jsonResult(await client.queryWorkItems(project, a.wiql as string));
    },
  },
  {
    name: "get_work_item",
    capability: "read",
    config: {
      title: "Get work item",
      description: "Fetch a single work item with its fields.",
      inputSchema: { id: z.number().int().describe("Work item id") },
    },
    handler: async (a, { client, policy }) => {
      policy.guard({ tool: "get_work_item", capability: "read" });
      return jsonResult(await client.getWorkItem(a.id as number));
    },
  },
  {
    name: "list_iterations",
    capability: "read",
    config: {
      title: "List iterations (sprints)",
      description: "List a team's iterations / sprints.",
      inputSchema: { project: z.string(), team: z.string() },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      policy.guard({ tool: "list_iterations", capability: "read", project });
      return jsonResult(await client.listIterations(project, a.team as string));
    },
  },
  {
    name: "list_repositories",
    capability: "read",
    config: {
      title: "List repositories",
      description: "List Git repositories in a project.",
      inputSchema: { project: z.string() },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      policy.guard({ tool: "list_repositories", capability: "read", project });
      return jsonResult(await client.listRepositories(project));
    },
  },
  {
    name: "list_branches",
    capability: "read",
    config: {
      title: "List branches",
      description: "List branches (heads) of a repository.",
      inputSchema: { project: z.string(), repo: z.string().describe("Repository id or name") },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      policy.guard({ tool: "list_branches", capability: "read", project });
      return jsonResult(await client.listBranches(project, a.repo as string));
    },
  },
  {
    name: "list_pull_requests",
    capability: "read",
    config: {
      title: "List pull requests",
      description: "List pull requests in a repository, by status.",
      inputSchema: {
        project: z.string(),
        repo: z.string(),
        status: z.enum(["active", "completed", "abandoned", "all"]).optional().describe("Default active"),
      },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      policy.guard({ tool: "list_pull_requests", capability: "read", project });
      return jsonResult(await client.listPullRequests(project, a.repo as string, (a.status as string) ?? "active"));
    },
  },
  {
    name: "get_pull_request",
    capability: "read",
    config: {
      title: "Get pull request",
      description: "Fetch a single pull request.",
      inputSchema: { project: z.string(), repo: z.string(), id: z.number().int() },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      policy.guard({ tool: "get_pull_request", capability: "read", project });
      return jsonResult(await client.getPullRequest(project, a.repo as string, a.id as number));
    },
  },
  {
    name: "list_pipelines",
    capability: "read",
    config: {
      title: "List pipelines",
      description: "List pipelines in a project.",
      inputSchema: { project: z.string() },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      policy.guard({ tool: "list_pipelines", capability: "read", project });
      return jsonResult(await client.listPipelines(project));
    },
  },
  {
    name: "list_builds",
    capability: "read",
    config: {
      title: "List builds",
      description: "List recent builds/runs in a project (most recent first).",
      inputSchema: { project: z.string(), top: z.number().int().min(1).max(200).optional().describe("Default 20") },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      policy.guard({ tool: "list_builds", capability: "read", project });
      return jsonResult(await client.listBuilds(project, (a.top as number) ?? 20));
    },
  },
  {
    name: "get_build",
    capability: "read",
    config: {
      title: "Get build",
      description: "Fetch a single build/run with status and result.",
      inputSchema: { project: z.string(), buildId: z.number().int() },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      policy.guard({ tool: "get_build", capability: "read", project });
      return jsonResult(await client.getBuild(project, a.buildId as number));
    },
  },
];
