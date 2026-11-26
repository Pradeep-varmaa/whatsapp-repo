import { NextRequest, NextResponse } from "next/server";
import { executeQuery, sql } from "@/server/database/connection";
import { requireAuth } from "@/server/security/guards";
import { validateGraph } from "@/server/workflows/validation";
import { validateCrossFlows } from "@/server/workflows/crossFlowValidation";
import { auditService } from "@/server/services/auditService";
import crypto from "crypto";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Server-side RBAC: 'user' cannot publish
  if (auth.user.role === "user") {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "Only administrators can publish workflows." },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const rows = await executeQuery<any>(
      `SELECT id, project_id, name, status, version, graph_json
       FROM workflows WHERE id = @id`,
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

    // Project permission check
    const isAdministrator = auth.user.role === "superadmin" || auth.user.role === "admin";
    const hasProjectAccess =
      isAdministrator ||
      (auth.user.projectIds && auth.user.projectIds.includes(wf.project_id)) ||
      auth.user.activeProjectId === wf.project_id ||
      !wf.project_id;

    if (!hasProjectAccess) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "You do not have permission to publish workflows in this project." },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 403 }
      );
    }

    let graph: any;
    try {
      graph = JSON.parse(wf.graph_json);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_JSON", message: "Workflow graph is not valid JSON." },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 400 }
      );
    }

    // Graph semantic validation
    const validation = validateGraph(graph);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "GRAPH_VALIDATION_FAILED",
            message: "Workflow graph contains structural or semantic errors and cannot be published.",
            details: validation.errors,
          },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 400 }
      );
    }

    // Cross-flow validation (requires published target flow, no cycles, max depth 5)
    const crossVal = await validateCrossFlows(wf.project_id, id, graph, true);
    if (!crossVal.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CROSS_FLOW_VALIDATION_FAILED",
            message: "Cross-flow validation failed: " + crossVal.errors.join("; "),
            details: crossVal.errors,
          },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 400 }
      );
    }

    // Extract trigger keyword from graph_json if available
    let triggerKeyword: string | null = null;
    try {
      const g = JSON.parse(wf.graph_json);
      const tn = g?.nodes?.find((n: any) => n.type === "trigger");
      if (tn?.data?.keyword) {
        triggerKeyword = String(tn.data.keyword).trim();
      }
    } catch {}

    // Set to active & sync trigger_value
    await executeQuery(
      `UPDATE workflows
       SET status = 'active',
           trigger_value = COALESCE(@triggerValue, trigger_value),
           updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      {
        id: { type: sql.NVarChar(64), value: id },
        triggerValue: { type: sql.NVarChar(255), value: triggerKeyword || null },
      }
    );

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    await auditService.record({
      request_id: correlationId,
      event: "workflow_published",
      outcome: "success",
      reason: "admin_published_workflow",
      ip,
      user_agent: req.headers.get("user-agent") || "",
      endpoint: `/api/workflows/${id}/publish`,
      http_status: 200,
      error_summary: `Published workflow "${wf.name}" (version ${wf.version})`,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: wf.id,
        name: wf.name,
        status: "active",
        version: wf.version,
      },
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "WORKFLOW_PUBLISH_FAILED", message: err.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}
