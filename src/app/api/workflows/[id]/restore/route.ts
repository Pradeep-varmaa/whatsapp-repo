import { NextRequest, NextResponse } from "next/server";
import { executeQuery, sql } from "@/server/database/connection";
import { requireAuth } from "@/server/security/guards";
import crypto from "crypto";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/workflows/[id]/restore
 * Restores a soft-deleted (archived) workflow back to 'draft' status.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role === "user") {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "Only administrators can restore workflows." },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const rows = await executeQuery<any>(
      `SELECT id, status FROM workflows WHERE id = @id`,
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

    await executeQuery(
      `UPDATE workflows 
       SET status = 'draft', updated_at = SYSUTCDATETIME() 
       WHERE id = @id`,
      { id: { type: sql.NVarChar(64), value: id } }
    );

    return NextResponse.json({
      success: true,
      data: { id, restored: true, status: "draft" },
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "WORKFLOW_RESTORE_FAILED", message: err.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}
