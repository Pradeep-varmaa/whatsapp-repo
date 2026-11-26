import { NextRequest, NextResponse } from "next/server";
import { executeQuery, sql } from "@/server/database/connection";
import { requireAuth } from "@/server/security/guards";
import { validateGraph } from "@/server/workflows/validation";
import { cloneWorkflowGraph, getClonedWorkflowName } from "@/server/workflows/clone";
import crypto from "crypto";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/workflows/[id]/clone
 * Duplicates a workflow:
 * - Copies graph into a new record with name "<name> (copy)"
 * - Always creates with status "draft", version 1
 * - Regenerates node and edge IDs and updates edge references
 * - Runs graph validator and returns any errors while saving as draft
 * - Enforces admin/superadmin RBAC
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Server-side RBAC: 'user' cannot create or duplicate workflows
  if (auth.user.role === "user") {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "Only administrators can duplicate workflows." },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    // 1. Fetch source workflow
    const rows = await executeQuery<any>(
      `SELECT id, project_id, phone_number_id, name, trigger_type, trigger_value,
              priority, status, version, graph_json
       FROM workflows
       WHERE id = @id`,
      { id: { type: sql.NVarChar(64), value: id } }
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: `Source workflow with id "${id}" not found.` },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 404 }
      );
    }

    const sourceWf = rows[0];

    // Optional custom name in request body
    let customName: string | undefined;
    try {
      const body = await req.json();
      if (body?.name && typeof body.name === "string" && body.name.trim()) {
        customName = body.name.trim();
      }
    } catch {
      // Body is optional
    }

    const newName = customName || getClonedWorkflowName(sourceWf.name);

    // 2. Parse source graph
    let sourceGraph = { nodes: [], edges: [] };
    try {
      sourceGraph = JSON.parse(sourceWf.graph_json);
    } catch {
      sourceGraph = { nodes: [], edges: [] };
    }

    // 3. Clone graph with regenerated IDs and updated edge references
    const { graph: clonedGraph } = cloneWorkflowGraph(sourceGraph);

    // 4. Run validator on the cloned graph
    const validationResult = validateGraph(clonedGraph);

    // 5. Generate new unique workflow ID
    const newWorkflowId = `wf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // 6. Save new workflow as DRAFT
    await executeQuery(
      `INSERT INTO workflows (
         id, project_id, phone_number_id, name, trigger_type, trigger_value,
         priority, status, version, graph_json, created_by, created_at, updated_at
       )
       VALUES (
         @id, @projectId, @phoneId, @name, @triggerType, @triggerValue,
         @priority, 'draft', 1, @graphJson, @createdBy, SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      {
        id: { type: sql.NVarChar(64), value: newWorkflowId },
        projectId: { type: sql.NVarChar(64), value: sourceWf.project_id },
        phoneId: { type: sql.NVarChar(64), value: sourceWf.phone_number_id || null },
        name: { type: sql.NVarChar(150), value: newName },
        triggerType: { type: sql.NVarChar(30), value: sourceWf.trigger_type },
        triggerValue: { type: sql.NVarChar(255), value: sourceWf.trigger_value || null },
        priority: { type: sql.Int, value: sourceWf.priority || 0 },
        graphJson: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(clonedGraph) },
        createdBy: { type: sql.NVarChar(64), value: auth.user.userId },
      }
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          id: newWorkflowId,
          projectId: sourceWf.project_id,
          name: newName,
          triggerType: sourceWf.trigger_type,
          triggerValue: sourceWf.trigger_value,
          status: "draft",
          version: 1,
          graph: clonedGraph,
        },
        validation: {
          valid: validationResult.valid,
          errors: validationResult.errors,
        },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "WORKFLOW_CLONE_FAILED", message: err.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}
