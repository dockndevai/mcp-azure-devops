import { z } from "zod";
import type { ToolDef } from "./types.js";
import { jsonResult, textResult } from "./types.js";

/**
 * Admin tools. create_project needs admin mode; delete_project is high-impact:
 * admin mode + AZDO_ALLOW_DELETE + a typed confirmation matching the project name.
 */
export const adminTools: ToolDef[] = [
  {
    name: "create_project",
    capability: "admin",
    config: {
      title: "Create project",
      description: "Create a new project. Requires admin mode. Provide a process template id (see list_processes).",
      inputSchema: {
        name: z.string(),
        description: z.string().optional(),
        processTemplateId: z.string().describe("Process template id from list_processes"),
        sourceControl: z.enum(["Git", "Tfvc"]).optional().describe("Default Git"),
        visibility: z.enum(["private", "public"]).optional().describe("Default private"),
      },
    },
    handler: async (a, { client, policy }) => {
      const name = a.name as string;
      const { dryRun } = policy.guard({ tool: "create_project", capability: "admin", project: name });
      const body = {
        name,
        description: a.description,
        capabilities: {
          versioncontrol: { sourceControlType: (a.sourceControl as string) ?? "Git" },
          processTemplate: { templateTypeId: a.processTemplateId },
        },
        visibility: (a.visibility as string) ?? "private",
      };
      if (dryRun) return textResult(`[dry-run] Would create project '${name}'.`);
      return jsonResult(await client.createProject(body));
    },
  },
  {
    name: "delete_project",
    capability: "admin",
    config: {
      title: "Delete project",
      description:
        "Permanently delete a project (all repos, work items, pipelines). Requires admin mode, AZDO_ALLOW_DELETE=true, " +
        "and a typed confirmation equal to the project name. Irreversible.",
      inputSchema: {
        projectId: z.string().describe("Project id (GUID)"),
        projectName: z.string().describe("Project name — used for the confirmation check"),
        confirm: z.string().optional().describe("Must equal the project name to proceed"),
      },
    },
    handler: async (a, { client, policy }) => {
      const projectName = a.projectName as string;
      const { dryRun } = policy.guard({
        tool: "delete_project",
        capability: "admin",
        project: projectName,
        destructive: true,
        confirmExpected: projectName,
        confirmProvided: a.confirm as string | undefined,
      });
      if (dryRun) return textResult(`[dry-run] Would delete project '${projectName}' (${a.projectId}).`);
      await client.deleteProject(a.projectId as string);
      return jsonResult({ deleted: true, project: projectName });
    },
  },
];
