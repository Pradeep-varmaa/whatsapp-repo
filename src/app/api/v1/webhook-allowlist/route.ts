import { NextRequest, NextResponse } from "next/server";
import { executeQuery, sql } from "@/server/database/connection";
import { requireAuth } from "@/server/security/guards";
import { PERMISSIONS } from "@/server/security/permissions";
import { auditService } from "@/server/services/auditService";
import { z } from "zod";
import crypto from "crypto";

const addHostSchema = z.object({
  hostname: z.string().min(1, "Hostname is required"),
  description: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req, PERMISSIONS.WHATSAPP_LIVE_VIEW);
  if (auth instanceof NextResponse) return auth;

  try {
    const rows = await executeQuery<any>(
      `SELECT allowlist_id, hostname, description, is_active, created_by, created_at
       FROM ENGINE_WEBHOOK_ALLOWLIST
       ORDER BY created_at DESC`
    );

    return NextResponse.json({
      success: true,
      data: rows || [],
      meta: { total: rows?.length || 0, correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: "ALLOWLIST_FETCH_FAILED", message: err.message }, meta: { correlationId, timestamp: new Date().toISOString() } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  // Superadmin only
  const auth = await requireAuth(req, PERMISSIONS.WEBHOOK_ALLOWLIST_MANAGE);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = addHostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => i.message).join(", ") }, meta: { correlationId, timestamp: new Date().toISOString() } },
        { status: 400 }
      );
    }

    const host = parsed.data.hostname.toLowerCase().trim();

    // Check for SSRF blacklist
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.")
    ) {
      return NextResponse.json(
        { success: false, error: { code: "SSRF_PROHIBITED", message: "Private network and local loopback hosts cannot be allowlisted." }, meta: { correlationId, timestamp: new Date().toISOString() } },
        { status: 400 }
      );
    }

    const allowlistId = `al_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    await executeQuery(
      `INSERT INTO ENGINE_WEBHOOK_ALLOWLIST (allowlist_id, hostname, description, is_active, created_by, created_at, updated_at)
       VALUES (@id, @host, @desc, 1, @by, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      {
        id: { type: sql.NVarChar(64), value: allowlistId },
        host: { type: sql.NVarChar(255), value: host },
        desc: { type: sql.NVarChar(255), value: parsed.data.description || null },
        by: { type: sql.NVarChar(64), value: auth.user.userId },
      }
    );

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "";
    await auditService.record({
      request_id: correlationId,
      event: "webhook_allowlist_added",
      outcome: "success",
      reason: "superadmin_added_host",
      ip,
      user_agent: userAgent,
      endpoint: "/api/v1/webhook-allowlist",
      http_status: 201,
      error_summary: `Added ${host} to webhook allowlist`,
    });

    return NextResponse.json(
      {
        success: true,
        data: { allowlistId, hostname: host },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: "ALLOWLIST_ADD_FAILED", message: err.message }, meta: { correlationId, timestamp: new Date().toISOString() } },
      { status: 500 }
    );
  }
}
