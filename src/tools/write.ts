import { z } from "zod";
import type { ToolDef } from "./types.js";
import { jsonResult, textResult } from "./types.js";

export const writeTools: ToolDef[] = [
  {
    name: "create_work_item",
    capability: "write",
    config: {
      title: "Create work item",
      description: "Create a work item (e.g. Bug, Task, User Story) with a title and optional description.",
      inputSchema: {
        project: z.string(),
        type: z.string().describe("Work item type, e.g. Bug, Task, User Story"),
        title: z.string(),
        description: z.string().optional(),
        assignedTo: z.string().optional().describe("User email/UPN to assign"),
      },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      const { dryRun } = policy.guard({ tool: "create_work_item", capability: "write", project });
      const patch: Array<Record<string, unknown>> = [{ op: "add", path: "/fields/System.Title", value: a.title }];
      if (a.description) patch.push({ op: "add", path: "/fields/System.Description", value: a.description });
      if (a.assignedTo) patch.push({ op: "add", path: "/fields/System.AssignedTo", value: a.assignedTo });
      if (dryRun) return textResult(`[dry-run] Would create ${a.type} in '${project}': ${JSON.stringify(patch)}`);
      return jsonResult(await client.createWorkItem(project, a.type as string, patch));
    },
  },
  {
    name: "update_work_item",
    capability: "write",
    config: {
      title: "Update work item",
      description: "Update fields of a work item (title, state, assignee, or arbitrary field paths).",
      inputSchema: {
        project: z.string().describe("Project (for scoping/audit)"),
        id: z.number().int(),
        title: z.string().optional(),
        state: z.string().optional().describe("e.g. Active, Resolved, Closed"),
        assignedTo: z.string().optional(),
        fields: z.record(z.any()).optional().describe("Extra field map, e.g. { \"System.Tags\": \"urgent\" }"),
      },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      const { dryRun } = policy.guard({ tool: "update_work_item", capability: "write", project });
      const patch: Array<Record<string, unknown>> = [];
      if (a.title) patch.push({ op: "add", path: "/fields/System.Title", value: a.title });
      if (a.state) patch.push({ op: "add", path: "/fields/System.State", value: a.state });
      if (a.assignedTo) patch.push({ op: "add", path: "/fields/System.AssignedTo", value: a.assignedTo });
      for (const [k, v] of Object.entries((a.fields as Record<string, unknown>) ?? {})) {
        patch.push({ op: "add", path: `/fields/${k}`, value: v });
      }
      if (patch.length === 0) return { content: [{ type: "text" as const, text: "No fields to update." }], isError: true };
      if (dryRun) return textResult(`[dry-run] Would update work item ${a.id}: ${JSON.stringify(patch)}`);
      return jsonResult(await client.updateWorkItem(a.id as number, patch));
    },
  },
  {
    name: "create_pull_request",
    capability: "write",
    config: {
      title: "Create pull request",
      description: "Open a pull request from a source branch into a target branch.",
      inputSchema: {
        project: z.string(),
        repo: z.string(),
        sourceBranch: z.string().describe("e.g. feature/x (without refs/heads/)"),
        targetBranch: z.string().describe("e.g. main"),
        title: z.string(),
        description: z.string().optional(),
      },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      const { dryRun } = policy.guard({ tool: "create_pull_request", capability: "write", project });
      const body = {
        sourceRefName: `refs/heads/${(a.sourceBranch as string).replace(/^refs\/heads\//, "")}`,
        targetRefName: `refs/heads/${(a.targetBranch as string).replace(/^refs\/heads\//, "")}`,
        title: a.title,
        description: a.description,
      };
      if (dryRun) return textResult(`[dry-run] Would open PR in ${project}/${a.repo}: ${JSON.stringify(body)}`);
      return jsonResult(await client.createPullRequest(project, a.repo as string, body));
    },
  },
  {
    name: "run_pipeline",
    capability: "write",
    config: {
      title: "Run pipeline",
      description: "Queue a run of a pipeline, optionally on a specific branch.",
      inputSchema: {
        project: z.string(),
        pipelineId: z.number().int(),
        branch: z.string().optional().describe("Branch to run, e.g. main"),
      },
    },
    handler: async (a, { client, policy }) => {
      const project = a.project as string;
      const { dryRun } = policy.guard({ tool: "run_pipeline", capability: "write", project });
      const body = a.branch
        ? { resources: { repositories: { self: { refName: `refs/heads/${(a.branch as string).replace(/^refs\/heads\//, "")}` } } } }
        : {};
      if (dryRun) return textResult(`[dry-run] Would run pipeline ${a.pipelineId} in '${project}'${a.branch ? ` on ${a.branch}` : ""}.`);
      return jsonResult(await client.runPipeline(project, a.pipelineId as number, body));
    },
  },
];
