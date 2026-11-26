import { NextRequest, NextResponse } from "next/server";
import { executeQuery, sql } from "@/server/database/connection";
import { requireAuth } from "@/server/security/guards";
import { auditService } from "@/server/services/auditService";
import { addHostToMemory, removeHostFromMemory, getMemoryHosts } from "@/server/security/webhookAllowlist";
import { z } from "zod";
import crypto from "crypto";

const addHostSchema = z.object({
  host: z.string().min(1, "Hostname or URL is required"),
  projectId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

const deleteHostSchema = z.object({
  id: z.string().min(1, "ID or host is required"),
});

/**
 * Clean & normalize hostname from input (supports URLs like https://varmatec.in/api, varmatec.in:443, etc.)
 */
function normalizeHostname(input: string): string {
  let host = input.toLowerCase().trim();
  if (host.includes("://")) {
    try {
      const u = new URL(host);
      host = u.hostname.toLowerCase().trim();
    } catch {
      // ignore parse error, fallback to split
    }
  }
  // Remove path or port if still present
  host = host.split("/")[0].split(":")[0].trim();
  return host;
}

/**
 * GET: List allowed hosts (user, admin, superadmin)
 */
export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    let rows: any[] = [];
    try {
      rows = await executeQuery<any>(
        `SELECT id, project_id, host, created_by, created_at, updated_at
         FROM webhook_allowlist
         ORDER BY created_at DESC`
      );
    } catch {
      // Table might not exist yet
    }

    // Also merge from legacy ENGINE_WEBHOOK_ALLOWLIST
    try {
      const legacy = await executeQuery<any>(
        `SELECT allowlist_id AS id, NULL AS project_id, hostname AS host, created_by, created_at, updated_at
         FROM ENGINE_WEBHOOK_ALLOWLIST
         ORDER BY created_at DESC`
      );
      if (legacy && legacy.length > 0) {
        const seenHosts = new Set((rows || []).map((r) => r.host?.toLowerCase()));
        for (const item of legacy) {
          if (item.host && !seenHosts.has(item.host.toLowerCase())) {
            rows.push(item);
            seenHosts.add(item.host.toLowerCase());
          }
        }
      }
    } catch {
      // Legacy table might not exist
    }

    // Also merge from memory hosts
    const memoryHosts = getMemoryHosts();
    const seenHosts = new Set((rows || []).map((r) => r.host?.toLowerCase()));
    for (const mHost of memoryHosts) {
      if (!seenHosts.has(mHost.toLowerCase())) {
        rows.push({
          id: `mem_${mHost}`,
          project_id: null,
          host: mHost,
          created_by: "system",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        seenHosts.add(mHost.toLowerCase());
      }
    }

    return NextResponse.json({
      success: true,
      data: rows || [],
      meta: { total: rows?.length || 0, correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "ALLOWLIST_FETCH_FAILED", message: err.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}

/**
 * POST: Add host to allowlist (Admin & Superadmin)
 */
export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Allow superadmin and admin roles
  if (auth.user.role !== "superadmin" && auth.user.role !== "admin") {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "Only administrators can manage the webhook allowlist." },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const parsed = addHostSchema.safeParse(body);
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

    const host = normalizeHostname(parsed.data.host);

    if (!host) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_HOSTNAME", message: "Please provide a valid domain name (e.g. varmatec.in)." },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 400 }
      );
    }

    // SSRF protection: block local/private network ranges
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "SSRF_PROHIBITED", message: "Private network and loopback hosts cannot be allowlisted." },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 400 }
      );
    }

    // Check if host already exists
    try {
      const existing = await executeQuery<any>(
        `SELECT TOP 1 id FROM webhook_allowlist WHERE host = @host`,
        { host: { type: sql.NVarChar(255), value: host } }
      );
      if (existing && existing.length > 0) {
        return NextResponse.json({
          success: true,
          message: `Host "${host}" is already allowlisted.`,
          data: { id: existing[0].id, host, projectId: parsed.data.projectId || null },
          meta: { correlationId, timestamp: new Date().toISOString() },
        });
      }
    } catch {}

    const id = `al_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const projectId = parsed.data.projectId || null;
    let inserted = false;

    // Insert into webhook_allowlist
    try {
      await executeQuery(
        `INSERT INTO webhook_allowlist (id, project_id, host, created_by, created_at, updated_at)
         VALUES (@id, @projectId, @host, @by, SYSUTCDATETIME(), SYSUTCDATETIME())`,
        {
          id: { type: sql.NVarChar(64), value: id },
          projectId: { type: sql.NVarChar(64), value: projectId },
          host: { type: sql.NVarChar(255), value: host },
          by: { type: sql.NVarChar(64), value: auth.user.userId },
        }
      );
      inserted = true;
    } catch {}

    // Also sync to legacy ENGINE_WEBHOOK_ALLOWLIST
    try {
      await executeQuery(
        `INSERT INTO ENGINE_WEBHOOK_ALLOWLIST (allowlist_id, hostname, description, is_active, created_by, created_at, updated_at)
         VALUES (@id, @host, @desc, 1, @by, SYSUTCDATETIME(), SYSUTCDATETIME())`,
        {
          id: { type: sql.NVarChar(64), value: id },
          host: { type: sql.NVarChar(255), value: host },
          desc: { type: sql.NVarChar(255), value: parsed.data.description || "Added via Webhook Allowlist Console" },
          by: { type: sql.NVarChar(64), value: auth.user.userId },
        }
      );
      inserted = true;
    } catch {}

    // Always persist in memory set for instant zero-latency lookup
    addHostToMemory(host);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    await auditService.record({
      request_id: correlationId,
      event: "webhook_allowlist_added",
      outcome: "success",
      reason: "admin_added_host",
      ip,
      user_agent: req.headers.get("user-agent") || "",
      endpoint: "/api/webhook-allowlist",
      http_status: 201,
      error_summary: `Added ${host} to webhook allowlist`,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Host "${host}" added to Webhook Allowlist successfully!`,
        data: { id, host, projectId },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "ALLOWLIST_ADD_FAILED", message: err.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE: Remove host from allowlist (Admin & Superadmin)
 */
export async function DELETE(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role !== "superadmin" && auth.user.role !== "admin") {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "Only administrators can manage the webhook allowlist." },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    const parsed = deleteHostSchema.safeParse({ id });
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Query parameter 'id' is required" },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 400 }
      );
    }

    const target = parsed.data.id;
    removeHostFromMemory(target);

    try {
      await executeQuery(`DELETE FROM webhook_allowlist WHERE id = @id OR host = @id`, {
        id: { type: sql.NVarChar(255), value: target },
      });
    } catch {}

    try {
      await executeQuery(`DELETE FROM ENGINE_WEBHOOK_ALLOWLIST WHERE allowlist_id = @id OR hostname = @id`, {
        id: { type: sql.NVarChar(255), value: target },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      data: { id: target, deleted: true },
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "ALLOWLIST_DELETE_FAILED", message: err.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}
