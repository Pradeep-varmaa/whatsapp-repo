import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/security/guards";
import { ApiKeyRepository } from "@/server/repositories/apiKeyRepository";
import { generateWaeApiKey } from "@/server/security/crypto";
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
  const oldKey = await repo.findById(id);
  if (!oldKey) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "API key not found" } }, { status: 404 });
  }

  // 2. Revoke old key
  await repo.revoke(id);

  // 3. Write key_revoked audit event
  await auditService.record({
    request_id: requestId,
    event: "key_revoked",
    outcome: "success",
    reason: "rotated",
    key_prefix: oldKey.key_prefix,
    api_key_id: oldKey.id,
    ip,
    user_agent: userAgent,
    endpoint: `/api/api-keys/${id}/rotate`,
    http_status: 200,
  });

  // 4. Generate new key
  const { rawKey, keyPrefix, keyHash } = generateWaeApiKey();
  const newKey = await repo.create({
    name: oldKey.name,
    key_prefix: keyPrefix,
    key_hash: keyHash,
    phone_number_id: oldKey.phone_number_id,
    project_id: oldKey.project_id,
    allowed_recipients: oldKey.allowed_recipients,
    scopes: oldKey.scopes,
    rate_limit_per_minute: oldKey.rate_limit_per_minute,
    expires_at: oldKey.expires_at,
    created_by: authUser.userId,
    raw_key: rawKey,
  });

  // 5. Write key_created audit event
  await auditService.record({
    request_id: requestId,
    event: "key_created",
    outcome: "success",
    reason: "rotated",
    key_prefix: keyPrefix,
    api_key_id: newKey.id,
    ip,
    user_agent: userAgent,
    endpoint: `/api/api-keys/${id}/rotate`,
    http_status: 201,
  });

  // Return new key ONCE
  return NextResponse.json({
    success: true,
    data: {
      id: newKey.id,
      name: newKey.name,
      keyPrefix: newKey.key_prefix,
      phoneNumberId: newKey.phone_number_id,
      rawKey, // Shown ONLY once
      previousKeyId: oldKey.id,
      scopes: newKey.scopes,
      rateLimitPerMinute: newKey.rate_limit_per_minute,
      expiresAt: newKey.expires_at,
      createdAt: newKey.created_at,
    },
  });
}
