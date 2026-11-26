import { NextRequest, NextResponse } from "next/server";
import { executeQuery, sql } from "@/server/database/connection";
import { requireAuth } from "@/server/security/guards";
import { workflowGraphSchema } from "@/server/workflows/validation";
import { STARTER_TEMPLATES } from "@/server/workflows/starterTemplates";
import { z } from "zod";
import crypto from "crypto";

const createWorkflowSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  phoneNumberId: z.string().optional().nullable(),
  name: z.string().min(1, "Workflow name is required").max(150),
  triggerType: z.enum(["keyword", "any_reply", "first_message"]).default("keyword"),
  triggerValue: z.string().optional().nullable(),
  priority: z.number().int().default(0),
  templateId: z.string().optional(),
  graph: workflowGraphSchema.optional(),
});

/**
 * GET: List workflows by project (user, admin, superadmin)
 */
export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const projectId =
    searchParams.get("projectId") ||
    req.headers.get("x-project-id") ||
    req.cookies.get("active_project_id")?.value ||
    auth.user.activeProjectId;

  try {
    const url = new URL(req.url);
    const includeArchived = url.searchParams.get("includeArchived") === "true";

    let query = `
      SELECT id, project_id, phone_number_id, name, trigger_type, trigger_value, 
             priority, status, version, created_by, created_at, updated_at
      FROM workflows
      WHERE 1=1
    `;
    const params: Record<string, { type: any; value: any }> = {};

    if (!includeArchived) {
      query += ` AND status != 'archived'`;
    }

    const statusParam = url.searchParams.get("status");
    if (statusParam) {
      query += ` AND status = @status`;
      params.status = { type: sql.NVarChar(30), value: statusParam };
    }

    if (projectId) {
      query += ` AND project_id = @projId`;
      params.projId = { type: sql.NVarChar(64), value: projectId };
    }

    query += ` ORDER BY priority DESC, updated_at DESC`;

    const rows = await executeQuery<any>(query, params);

    return NextResponse.json({
      success: true,
      data: rows || [],
      meta: { total: rows?.length || 0, correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "WORKFLOWS_LIST_FAILED", message: err.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}

/**
 * POST: Create a new workflow (admin, superadmin only)
 */
export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Server-side RBAC: 'user' cannot create or edit workflows
  if (auth.user.role === "user") {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "Only administrators can create workflows." },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const parsed = createWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => i.message).join(", ") },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 400 }
      );
    }

    const { projectId, phoneNumberId, name, triggerType, triggerValue, priority, templateId, graph } = parsed.data;

    // Pick starter template graph if templateId provided, or provided graph, or minimal valid graph
    let initialGraph = graph;
    let initialTriggerType = triggerType;
    let initialTriggerValue = triggerValue;

    if (templateId) {
      const tpl = STARTER_TEMPLATES.find((t) => t.id === templateId);
      if (tpl) {
        initialGraph = tpl.graph;
        initialTriggerType = tpl.triggerType;
        initialTriggerValue = tpl.triggerValue;
      }
    }

    if (!initialGraph) {
      initialGraph = {
        nodes: [
          {
            id: "node_trigger",
            type: "trigger",
            position: { x: 250, y: 50 },
            data: { keyword: initialTriggerValue || "HI, HELLO", description: "Triggered on greeting" },
          },
          {
            id: "node_msg_1",
            type: "message",
            position: { x: 250, y: 180 },
            data: { text: "Hello! Thank you for contacting us." },
          },
          {
            id: "node_end",
            type: "end",
            position: { x: 250, y: 320 },
            data: { text: "Have a great day!" },
          },
        ],
        edges: [
          { from: "node_trigger", port: "next", to: "node_msg_1" },
          { from: "node_msg_1", port: "next", to: "node_end" },
        ],
      };
    }

    const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    await executeQuery(
      `INSERT INTO workflows (id, project_id, phone_number_id, name, trigger_type, trigger_value, priority, status, version, graph_json, created_by, created_at, updated_at)
       VALUES (@id, @projectId, @phoneId, @name, @triggerType, @triggerValue, @priority, 'draft', 1, @graphJson, @createdBy, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      {
        id: { type: sql.NVarChar(64), value: workflowId },
        projectId: { type: sql.NVarChar(64), value: projectId },
        phoneId: { type: sql.NVarChar(64), value: phoneNumberId || null },
        name: { type: sql.NVarChar(150), value: name },
        triggerType: { type: sql.NVarChar(30), value: initialTriggerType },
        triggerValue: { type: sql.NVarChar(255), value: initialTriggerValue || null },
        priority: { type: sql.Int, value: priority },
        graphJson: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(initialGraph) },
        createdBy: { type: sql.NVarChar(64), value: auth.user.userId },
      }
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          id: workflowId,
          projectId,
          name,
          triggerType: initialTriggerType,
          triggerValue: initialTriggerValue,
          status: "draft",
          version: 1,
          graph: initialGraph,
        },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "WORKFLOW_CREATE_FAILED", message: err.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}
