import { NextRequest, NextResponse } from "next/server";
import { executeQuery, sql } from "@/server/database/connection";
import { requireAuth } from "@/server/security/guards";
import crypto from "crypto";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || "50"), 100);

  try {
    const runs = await executeQuery<any>(
      `SELECT TOP (@limit)
              r.id, r.workflow_id, r.workflow_version, r.project_id, r.phone_number_id,
              r.customer_phone, r.current_node_id, r.status, r.context_json, r.step_count,
              r.expires_at, r.created_at, r.updated_at
       FROM workflow_runs r
       WHERE r.workflow_id = @id
       ORDER BY r.created_at DESC`,
      {
        id: { type: sql.NVarChar(64), value: id },
        limit: { type: sql.Int, value: limit },
      }
    );

    const formattedRuns = (runs || []).map((r) => {
      let context = {};
      try {
        context = JSON.parse(r.context_json);
      } catch {
        // Fallback
      }
      return {
        id: r.id,
        workflowId: r.workflow_id,
        workflowVersion: r.workflow_version,
        projectId: r.project_id,
        phoneNumberId: r.phone_number_id,
        customerPhone: r.customer_phone,
        currentNodeId: r.current_node_id,
        status: r.status,
        context,
        stepCount: r.step_count,
        expiresAt: r.expires_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    // Also get audit log entries for these runs using parameterized IN clause
    let logs: any[] = [];
    if (formattedRuns.length > 0) {
      const logParams: Record<string, { type: sql.ISqlType; value: any }> = {};
      const placeholders = formattedRuns.map((r, idx) => {
        const key = `rid${idx}`;
        logParams[key] = { type: sql.NVarChar(64), value: r.id };
        return `@${key}`;
      });
      try {
        logs = await executeQuery<any>(
          `SELECT id, run_id, node_id, event, detail, created_at
           FROM workflow_audit_log
           WHERE run_id IN (${placeholders.join(",")})
           ORDER BY created_at ASC`,
          logParams
        );
      } catch {
        // Fallback if empty
      }
    }

    const logsByRunId: Record<string, any[]> = {};
    for (const log of logs) {
      if (!logsByRunId[log.run_id]) logsByRunId[log.run_id] = [];
      let parsedDetail = log.detail;
      try {
        parsedDetail = JSON.parse(log.detail);
      } catch {
        // Keep string
      }
      logsByRunId[log.run_id].push({
        id: log.id,
        nodeId: log.node_id,
        event: log.event,
        detail: parsedDetail,
        createdAt: log.created_at,
      });
    }

    const runsWithLogs = formattedRuns.map((r) => ({
      ...r,
      logs: logsByRunId[r.id] || [],
    }));

    return NextResponse.json({
      success: true,
      data: runsWithLogs,
      meta: { total: runsWithLogs.length, correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "WORKFLOW_RUNS_FETCH_FAILED", message: err.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}
