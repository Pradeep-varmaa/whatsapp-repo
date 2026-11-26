import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/security/guards";
import { ApiKeyRepository } from "@/server/repositories/apiKeyRepository";
import { auditService } from "@/server/services/auditService";
import crypto from "crypto";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
  const userAgent = req.headers.get("user-agent") || "";

  // 1. Enforce admin / superadmin
  const authUser = await authenticateRequest(req);
  if (!authUser) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
  }

  if (authUser.role !== "admin" && authUser.role !== "superadmin") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Admin role required" } }, { status: 403 });
  }

  const repo = new ApiKeyRepository();
  const existing = await repo.findById(id);
  if (!existing) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "API key not found" } }, { status: 404 });
  }

  await repo.revoke(id);

  // 2. Write key_revoked audit event
  await auditService.record({
    request_id: requestId,
    event: "key_revoked",
    outcome: "success",
    reason: "revoked",
    key_prefix: existing.key_prefix,
    api_key_id: existing.id,
    ip,
    user_agent: userAgent,
    endpoint: `/api/api-keys/${id}/revoke`,
    http_status: 200,
  });

  return NextResponse.json({
    success: true,
    data: { id, status: "revoked", revokedAt: new Date().toISOString() },
  });
}
