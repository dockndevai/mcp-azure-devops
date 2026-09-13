import { z } from "zod";
import type { ToolDef } from "./types.js";
import { jsonResult } from "./types.js";

/** Every project-scoped tool takes the project name or id; kept consistent so the model always knows the shape. */
const project = z.string().describe("Project name or id (must be within AZDO_PROJECT_ALLOWLIST when that is set)");

export const readTools: ToolDef[] = [
  {
    name: "list_projects",
    capability: "read",
    config: {
      title: "List projects",
      description:
        "List the projects in the Azure DevOps organization that pass the allowlist. Returns each project's id, name, " +
        "state, and whether it is marked protected (readable but never mutated). Start here to discover valid project names.",
      inputSchema: {},
    },
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
      description: "Fetch the full details (id, description, visibility, state, capabilities) of a single project.",
      inputSchema: { project },
    },
    handler: async (a, { client, policy }) => {
      const p = a.project as string;
      policy.guard({ tool: "get_project", capability: "read", project: p });
      return jsonResult(await client.getProject(p));
    },
  },
  {
    name: "list_teams",
    capability: "read",
    config: {
      title: "List teams",
      description: "List the teams defined in a project, with their ids and names. Use a team id/name with the team-scoped tools.",
      inputSchema: { project },
    },
    handler: async (a, { client, policy }) => {
      const p = a.project as string;
      policy.guard({ tool: "list_teams", capability: "read", project: p });
      return jsonResult(await client.listTeams(p));
    },
  },
  {
    name: "list_team_members",
    capability: "read",
    config: {
      title: "List team members",
      description: "List the members (identities: display name and unique name) of a specific team within a project.",
      inputSchema: { project, team: z.string().describe("Team id or name (from list_teams)") },
    },
    handler: async (a, { client, policy }) => {
      const p = a.project as string;
      policy.guard({ tool: "list_team_members", capability: "read", project: p });
      return jsonResult(await client.listTeamMembers(p, a.team as string));
    },
  },
  {
    name: "list_processes",
    capability: "read",
    config: {
      title: "List processes",
      description:
        "List the organization's process templates (Agile, Scrum, CMMI, or inherited) with their ids. Pass one of these ids " +
        "as the process when creating a project.",
      inputSchema: {},
    },
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
      description:
        "Run a Work Item Query Language (WIQL) query against a project and return the matching work-item ids (fetch fields " +
        "with get_work_item). Example: SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Active'.",
      inputSchema: {
        project,
        wiql: z.string().describe("A WIQL query string, e.g. SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Bug'"),
      },
    },
    handler: async (a, { client, policy }) => {
      const p = a.project as string;
      policy.guard({ tool: "query_work_items", capability: "read", project: p });
      return jsonResult(await client.queryWorkItems(p, a.wiql as string));
    },
  },
  {
    name: "get_work_item",
    capability: "read",
    config: {
      title: "Get work item",
      description: "Fetch a single work item by id, including all of its fields (title, state, assignee, tags, …).",
      inputSchema: { id: z.number().int().describe("Work item id (from query_work_items)") },
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
      description: "List a team's iterations (sprints), each with its path and start/finish dates.",
      inputSchema: { project, team: z.string().describe("Team id or name (from list_teams)") },
    },
    handler: async (a, { client, policy }) => {
      const p = a.project as string;
      policy.guard({ tool: "list_iterations", capability: "read", project: p });
      return jsonResult(await client.listIterations(p, a.team as string));
    },
  },
  {
    name: "list_repositories",
    capability: "read",
    config: {
      title: "List repositories",
      description: "List the Git repositories in a project, with their ids, names, and default branches.",
      inputSchema: { project },
    },
    handler: async (a, { client, policy }) => {
      const p = a.project as string;
      policy.guard({ tool: "list_repositories", capability: "read", project: p });
      return jsonResult(await client.listRepositories(p));
    },
  },
  {
    name: "list_branches",
    capability: "read",
    config: {
      title: "List branches",
      description: "List the branches (refs/heads) of a Git repository, with the commit each one points at.",
      inputSchema: { project, repo: z.string().describe("Repository id or name (from list_repositories)") },
    },
    handler: async (a, { client, policy }) => {
      const p = a.project as string;
      policy.guard({ tool: "list_branches", capability: "read", project: p });
      return jsonResult(await client.listBranches(p, a.repo as string));
    },
  },
  {
    name: "list_pull_requests",
    capability: "read",
    config: {
      title: "List pull requests",
      description: "List pull requests in a repository, optionally filtered by status (active by default).",
      inputSchema: {
        project,
        repo: z.string().describe("Repository id or name (from list_repositories)"),
        status: z
          .enum(["active", "completed", "abandoned", "all"])
          .optional()
          .describe("Filter by PR status; defaults to 'active'"),
      },
    },
    handler: async (a, { client, policy }) => {
      const p = a.project as string;
      policy.guard({ tool: "list_pull_requests", capability: "read", project: p });
      return jsonResult(await client.listPullRequests(p, a.repo as string, (a.status as string) ?? "active"));
    },
  },
  {
    name: "get_pull_request",
    capability: "read",
    config: {
      title: "Get pull request",
      description: "Fetch a single pull request by id, including its source/target branches, status, and reviewers.",
      inputSchema: {
        project,
        repo: z.string().describe("Repository id or name (from list_repositories)"),
        id: z.number().int().describe("Pull request id (from list_pull_requests)"),
      },
    },
    handler: async (a, { client, policy }) => {
      const p = a.project as string;
      policy.guard({ tool: "get_pull_request", capability: "read", project: p });
      return jsonResult(await client.getPullRequest(p, a.repo as string, a.id as number));
    },
  },
  {
    name: "list_pipelines",
    capability: "read",
    config: {
      title: "List pipelines",
      description: "List the pipelines defined in a project, with their ids and names. Use a pipeline id with run_pipeline.",
      inputSchema: { project },
    },
    handler: async (a, { client, policy }) => {
      const p = a.project as string;
      policy.guard({ tool: "list_pipelines", capability: "read", project: p });
      return jsonResult(await client.listPipelines(p));
    },
  },
  {
    name: "list_builds",
    capability: "read",
    config: {
      title: "List builds",
      description: "List recent builds / pipeline runs in a project, most recent first, with their status and result.",
      inputSchema: {
        project,
        top: z.number().int().min(1).max(200).optional().describe("Maximum runs to return (1–200, default 20)"),
      },
    },
    handler: async (a, { client, policy }) => {
      const p = a.project as string;
      policy.guard({ tool: "list_builds", capability: "read", project: p });
      return jsonResult(await client.listBuilds(p, (a.top as number) ?? 20));
    },
  },
  {
    name: "get_build",
    capability: "read",
    config: {
      title: "Get build",
      description: "Fetch a single build / pipeline run by id, with its status, result, and timing.",
      inputSchema: { project, buildId: z.number().int().describe("Build / run id (from list_builds)") },
    },
    handler: async (a, { client, policy }) => {
      const p = a.project as string;
      policy.guard({ tool: "get_build", capability: "read", project: p });
      return jsonResult(await client.getBuild(p, a.buildId as number));
    },
  },
];
