import { NextRequest, NextResponse } from "next/server";
import { executeQuery, sql } from "@/server/database/connection";
import { requireAuth } from "@/server/security/guards";
import { workflowGraphSchema } from "@/server/workflows/validation";
import { validateCrossFlows, checkWorkflowReferences } from "@/server/workflows/crossFlowValidation";
import { z } from "zod";
import crypto from "crypto";

const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  phoneNumberId: z.string().optional().nullable(),
  triggerType: z.enum(["keyword", "any_reply", "first_message"]).optional(),
  triggerValue: z.string().optional().nullable(),
  priority: z.number().int().optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  graph: workflowGraphSchema.optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/workflows/[id]
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const rows = await executeQuery<any>(
      `SELECT id, project_id, phone_number_id, name, trigger_type, trigger_value,
              priority, status, version, graph_json, created_by, created_at, updated_at
       FROM workflows
       WHERE id = @id`,
      { id: { type: sql.NVarChar(64), value: id } }
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: `Workflow with id "${id}" not found.` },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 404 }
      );
    }

    const wf = rows[0];
    let graph = { nodes: [], edges: [] };
    try {
      graph = JSON.parse(wf.graph_json);
    } catch {
      // Keep empty default if corrupted
    }

    return NextResponse.json({
      success: true,
      data: {
        id: wf.id,
        projectId: wf.project_id,
        phoneNumberId: wf.phone_number_id,
        name: wf.name,
        triggerType: wf.trigger_type,
        triggerValue: wf.trigger_value,
        priority: wf.priority,
        status: wf.status,
        version: wf.version,
        graph,
        createdBy: wf.created_by,
        createdAt: wf.created_at,
        updatedAt: wf.updated_at,
      },
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "WORKFLOW_FETCH_FAILED", message: err.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/workflows/[id]
 * Editing an active workflow bumps version into draft; in-progress runs retain their previous version.
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Server-side RBAC: 'user' cannot edit
  if (auth.user.role === "user") {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "Only administrators can modify workflows." },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const existing = await executeQuery<any>(
      `SELECT id, project_id, phone_number_id, name, trigger_type, trigger_value, priority, status, version, graph_json
       FROM workflows WHERE id = @id`,
      { id: { type: sql.NVarChar(64), value: id } }
    );

    if (!existing || existing.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: `Workflow with id "${id}" not found.` },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 404 }
      );
    }

    const current = existing[0];

    // Server-side project permission check
    const isAdministrator = auth.user.role === "superadmin" || auth.user.role === "admin";
    const hasProjectAccess =
      isAdministrator ||
      (auth.user.projectIds && auth.user.projectIds.includes(current.project_id)) ||
      auth.user.activeProjectId === current.project_id ||
      !current.project_id;

    if (!hasProjectAccess) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "You do not have permission to modify workflows in this project." },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateWorkflowSchema.safeParse(body);
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

    // Cross-flow validation on save
    if (parsed.data.graph) {
      const crossVal = await validateCrossFlows(current.project_id, id, parsed.data.graph, false);
      if (!crossVal.valid) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "CROSS_FLOW_VALIDATION_FAILED",
              message: crossVal.errors.join("; "),
              details: crossVal.errors,
            },
            meta: { correlationId, timestamp: new Date().toISOString() },
          },
          { status: 400 }
        );
      }
    }

    const nextName = parsed.data.name ?? current.name;
    const nextPhoneId = parsed.data.phoneNumberId !== undefined ? parsed.data.phoneNumberId : current.phone_number_id;
    const nextTriggerType = parsed.data.triggerType ?? current.trigger_type;

    // Automatically sync trigger_value from the graph's Trigger node if available
    const triggerNode = parsed.data.graph?.nodes?.find((n: any) => n.type === "trigger");
    const graphKeyword = typeof triggerNode?.data?.keyword === "string" ? triggerNode.data.keyword.trim() : undefined;
    const nextTriggerValue = parsed.data.triggerValue !== undefined
      ? parsed.data.triggerValue
      : (graphKeyword !== undefined ? (graphKeyword || null) : current.trigger_value);

    const nextPriority = parsed.data.priority ?? current.priority;
    const nextGraphJson = parsed.data.graph ? JSON.stringify(parsed.data.graph) : current.graph_json;

    // If workflow was active, editing moves it to a new draft version
    let nextVersion = current.version;
    let nextStatus = parsed.data.status ?? current.status;

    if (current.status === "active" && (!parsed.data.status || parsed.data.status === "active")) {
      nextVersion = current.version + 1;
      nextStatus = "draft";
    }

    await executeQuery(
      `UPDATE workflows
       SET name = @name,
           phone_number_id = @phoneId,
           trigger_type = @triggerType,
           trigger_value = @triggerValue,
           priority = @priority,
           status = @status,
           version = @version,
           graph_json = @graphJson,
           updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      {
        id: { type: sql.NVarChar(64), value: id },
        name: { type: sql.NVarChar(150), value: nextName },
        phoneId: { type: sql.NVarChar(64), value: nextPhoneId || null },
        triggerType: { type: sql.NVarChar(30), value: nextTriggerType },
        triggerValue: { type: sql.NVarChar(255), value: nextTriggerValue || null },
        priority: { type: sql.Int, value: nextPriority },
        status: { type: sql.NVarChar(30), value: nextStatus },
        version: { type: sql.Int, value: nextVersion },
        graphJson: { type: sql.NVarChar(sql.MAX), value: nextGraphJson },
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        id,
        name: nextName,
        phoneNumberId: nextPhoneId,
        triggerType: nextTriggerType,
        triggerValue: nextTriggerValue,
        priority: nextPriority,
        status: nextStatus,
        version: nextVersion,
        graph: parsed.data.graph ? parsed.data.graph : JSON.parse(nextGraphJson),
      },
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "WORKFLOW_UPDATE_FAILED", message: err.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workflows/[id]
 * Supports soft-delete by default (setting status = 'archived').
 * If query param ?hard=true is passed by an admin, hard delete is performed.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role === "user") {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "Only administrators can delete workflows." },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 403 }
    );
  }

  const { id } = await params;
  const url = new URL(req.url);
  const isHard = url.searchParams.get("hard") === "true";

  try {
    const existing = await executeQuery<any>(
      `SELECT id, project_id, name FROM workflows WHERE id = @id`,
      { id: { type: sql.NVarChar(64), value: id } }
    );

    if (!existing || existing.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: `Workflow with id "${id}" not found.` },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 404 }
      );
    }

    const currentFlow = existing[0];

    // Project permission check
    const isAdministrator = auth.user.role === "superadmin" || auth.user.role === "admin";
    const hasProjectAccess =
      isAdministrator ||
      (auth.user.projectIds && auth.user.projectIds.includes(currentFlow.project_id)) ||
      auth.user.activeProjectId === currentFlow.project_id ||
      !currentFlow.project_id;

    if (!hasProjectAccess) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "You do not have permission to delete workflows in this project." },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 403 }
      );
    }

    // Block deleting a flow that is referenced by another workflow in the project
    const refCheck = await checkWorkflowReferences(currentFlow.project_id, id);
    if (refCheck.isReferenced) {
      const referencingNames = refCheck.referencingFlows.map((f) => `"${f.name}"`).join(", ");
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "WORKFLOW_REFERENCED",
            message: `Cannot delete workflow "${currentFlow.name}": It is referenced by other workflow(s): ${referencingNames}. Remove the Go to Flow step(s) in those workflows before deleting.`,
            referencingFlows: refCheck.referencingFlows,
          },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 409 }
      );
    }

    if (isHard) {
      await executeQuery(`DELETE FROM workflows WHERE id = @id`, {
        id: { type: sql.NVarChar(64), value: id },
      });

      return NextResponse.json({
        success: true,
        data: { id, deleted: true, mode: "hard" },
        meta: { correlationId, timestamp: new Date().toISOString() },
      });
    }

    // Soft delete: update status to 'archived'
    await executeQuery(
      `UPDATE workflows 
       SET status = 'archived', updated_at = SYSUTCDATETIME() 
       WHERE id = @id`,
      {
        id: { type: sql.NVarChar(64), value: id },
      }
    );

    return NextResponse.json({
      success: true,
      data: { id, deleted: true, mode: "soft", status: "archived" },
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "WORKFLOW_DELETE_FAILED", message: err.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}
