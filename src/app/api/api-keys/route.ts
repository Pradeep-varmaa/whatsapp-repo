import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/security/guards";
import { ApiKeyRepository } from "@/server/repositories/apiKeyRepository";
import { generateWaeApiKey, normalizePhoneE164, isValidE164 } from "@/server/security/crypto";
import { auditService } from "@/server/services/auditService";
import { z } from "zod";
import crypto from "crypto";

const createKeySchema = z.object({
  name: z.string().min(1, "Name is required"),
  phoneNumberId: z.string().min(1, "Phone Number ID is required"),
  projectId: z.string().optional().nullable(),
  allowedRecipients: z.array(z.string()).optional().nullable(),
  scopes: z.array(z.string()).default(["messages:send"]),
  rateLimitPerMinute: z.coerce.number().min(1).default(60),
  expiresAt: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
  const userAgent = req.headers.get("user-agent") || "";

  // 1. Enforce Admin / Superadmin role on the server
  const authUser = await authenticateRequest(req);
  if (!authUser) {
    await auditService.record({
      request_id: requestId,
      event: "auth_failed",
      outcome: "failure",
      reason: "invalid_key",
      ip,
      user_agent: userAgent,
      endpoint: "/api/api-keys",
      http_status: 401,
      error_summary: "Authentication required to list API keys",
    });
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
  }

  const repo = new ApiKeyRepository();
  const allKeys = await repo.listAll();

  const targetProjectId =
    req.headers.get("x-project-id") ||
    req.cookies.get("active_project_id")?.value ||
    req.nextUrl.searchParams.get("projectId") ||
    authUser.activeProjectId;

  const keys = targetProjectId
    ? allKeys.filter((k) => k.project_id === targetProjectId)
    : allKeys;

  // Return formatted safe key items (never hashes)
  const safeData = keys.map((k) => {
    let status = "active";
    if (k.revoked_at) {
      status = "revoked";
    } else if (k.expires_at && new Date(k.expires_at).getTime() < Date.now()) {
      status = "expired";
    }
    return {
      id: k.id,
      name: k.name,
      keyPrefix: k.key_prefix,
      phoneNumberId: k.phone_number_id,
      projectId: k.project_id,
      allowedRecipients: k.allowed_recipients,
      scopes: k.scopes,
      rateLimitPerMinute: k.rate_limit_per_minute,
      status,
      expiresAt: k.expires_at,
      lastUsedAt: k.last_used_at,
      revokedAt: k.revoked_at,
      createdAt: k.created_at,
      createdBy: k.created_by,
    };
  });

  return NextResponse.json({ success: true, data: safeData });
}

export async function POST(req: NextRequest) {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
  const userAgent = req.headers.get("user-agent") || "";

  // 1. Enforce Admin / Superadmin role on the server
  const authUser = await authenticateRequest(req);
  if (!authUser) {
    await auditService.record({
      request_id: requestId,
      event: "auth_failed",
      outcome: "failure",
      reason: "invalid_key",
      ip,
      user_agent: userAgent,
      endpoint: "/api/api-keys",
      http_status: 401,
      error_summary: "Authentication required to generate API key",
    });
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
  }

  if (authUser.role !== "admin" && authUser.role !== "superadmin") {
    await auditService.record({
      request_id: requestId,
      event: "forbidden",
      outcome: "failure",
      reason: "wrong_scope",
      ip,
      user_agent: userAgent,
      endpoint: "/api/api-keys",
      http_status: 403,
      error_summary: "Only admins can generate API keys",
    });
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Only administrators can generate API keys" } }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = createKeySchema.safeParse(body);

    if (!parsed.success) {
      await auditService.record({
        request_id: requestId,
        event: "validation_failed",
        outcome: "failure",
        reason: "validation_error",
        ip,
        user_agent: userAgent,
        endpoint: "/api/api-keys",
        http_status: 400,
        error_summary: parsed.error.issues.map((i) => i.message).join(", "),
      });
      return NextResponse.json({ success: false, error: { code: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message } }, { status: 400 });
    }

    const input = parsed.data;

    // Normalize and validate allowed_recipients to E.164
    let normalizedRecipients: string[] | null = null;
    if (input.allowedRecipients && input.allowedRecipients.length > 0) {
      const validated: string[] = [];
      for (const raw of input.allowedRecipients) {
        const norm = normalizePhoneE164(raw);
        if (!norm || !isValidE164(norm)) {
          await auditService.record({
            request_id: requestId,
            event: "validation_failed",
            outcome: "failure",
            reason: "invalid_phone_number",
            ip,
            user_agent: userAgent,
            endpoint: "/api/api-keys",
            http_status: 400,
            error_summary: `Invalid E.164 phone format for recipient: ${raw}`,
          });
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "VALIDATION_FAILED",
                message: `Invalid E.164 phone number: "${raw}". Must include country code (e.g. +15551234567 or +919014683627).`,
              },
            },
            { status: 400 }
          );
        }
        if (!validated.includes(norm)) {
          validated.push(norm);
        }
      }
      normalizedRecipients = validated.length > 0 ? validated : null;
    }

    // 2. Generate key with crypto.randomBytes(32), formatted like "wae_live_" + base64url
    const { rawKey, keyPrefix, keyHash } = generateWaeApiKey();

    const repo = new ApiKeyRepository();
    const newRecord = await repo.create({
      name: input.name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      phone_number_id: input.phoneNumberId,
      project_id: input.projectId || null,
      allowed_recipients: normalizedRecipients,
      scopes: input.scopes || ["messages:send"],
      rate_limit_per_minute: input.rateLimitPerMinute,
      expires_at: input.expiresAt || null,
      created_by: authUser.userId,
      raw_key: rawKey,
    });

    // 3. Write key_created audit event
    await auditService.record({
      request_id: requestId,
      event: "key_created",
      outcome: "success",
      reason: "key_created",
      key_prefix: keyPrefix,
      api_key_id: newRecord.id,
      ip,
      user_agent: userAgent,
      endpoint: "/api/api-keys",
      http_status: 201,
    });

    // Return the full key ONCE
    return NextResponse.json(
      {
        success: true,
        data: {
          id: newRecord.id,
          name: newRecord.name,
          keyPrefix: newRecord.key_prefix,
          phoneNumberId: newRecord.phone_number_id,
          rawKey, // Shown ONLY once
          scopes: newRecord.scopes,
          rateLimitPerMinute: newRecord.rate_limit_per_minute,
          expiresAt: newRecord.expires_at,
          createdAt: newRecord.created_at,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: { code: "SERVER_ERROR", message: errorMsg } }, { status: 500 });
  }
}

// Backwards-compatible DELETE
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keyId = searchParams.get("keyId") || searchParams.get("id");
  if (!keyId) {
    return NextResponse.json({ success: false, error: { message: "keyId required" } }, { status: 400 });
  }

  const authUser = await authenticateRequest(req);
  if (!authUser || (authUser.role !== "admin" && authUser.role !== "superadmin")) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 403 });
  }

  const repo = new ApiKeyRepository();
  const existing = await repo.findById(keyId);
  await repo.revoke(keyId);

  await auditService.record({
    request_id: `req_${Date.now()}_rev`,
    event: "key_revoked",
    outcome: "success",
    reason: "revoked",
    key_prefix: existing?.key_prefix || null,
    api_key_id: keyId,
    endpoint: "/api/api-keys",
    http_status: 200,
  });

  return NextResponse.json({ success: true, data: { revokedKeyId: keyId } });
}
