import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/security/guards";
import { ApiKeyRepository } from "@/server/repositories/apiKeyRepository";
import { normalizePhoneE164, isValidE164 } from "@/server/security/crypto";
import { auditService } from "@/server/services/auditService";
import { z } from "zod";
import crypto from "crypto";

const updateKeySchema = z.object({
  name: z.string().min(1, "Name cannot be empty").optional(),
  allowedRecipients: z.array(z.string()).optional().nullable(),
  rateLimitPerMinute: z.coerce.number().min(1, "Rate limit must be at least 1").optional(),
  expiresAt: z.string().optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
  const userAgent = req.headers.get("user-agent") || "";
  const endpoint = `/api/api-keys/${id}`;

  // 1. Enforce Admin / Superadmin role
  const authUser = await authenticateRequest(req);
  if (!authUser) {
    await auditService.record({
      request_id: requestId,
      event: "auth_failed",
      outcome: "failure",
      reason: "invalid_key",
      ip,
      user_agent: userAgent,
      endpoint,
      http_status: 401,
      error_summary: "Authentication required to update API key",
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
      endpoint,
      http_status: 403,
      error_summary: "Only admins and superadmins can update API keys",
    });
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Only administrators can update API keys" } }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = updateKeySchema.safeParse(body);

    if (!parsed.success) {
      await auditService.record({
        request_id: requestId,
        event: "validation_failed",
        outcome: "failure",
        reason: "validation_error",
        ip,
        user_agent: userAgent,
        endpoint,
        http_status: 400,
        error_summary: parsed.error.issues.map((i) => i.message).join(", "),
      });
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message } },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // 2. Normalize and validate allowed_recipients to E.164 if provided
    let normalizedRecipients: string[] | null | undefined = undefined;
    if (input.allowedRecipients !== undefined) {
      if (input.allowedRecipients === null || input.allowedRecipients.length === 0) {
        normalizedRecipients = null;
      } else {
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
              endpoint,
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
    }

    // 3. Update the key in repository (never allows changing key secret or hash)
    const repo = new ApiKeyRepository();
    const result = await repo.update(id, {
      name: input.name,
      allowed_recipients: normalizedRecipients,
      rate_limit_per_minute: input.rateLimitPerMinute,
      expires_at: input.expiresAt,
    });

    if (!result) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: `API Key ${id} not found` } },
        { status: 404 }
      );
    }

    // 4. Write audit row for key_updated with CHANGED FIELD NAMES ONLY (never values)
    await auditService.record({
      request_id: requestId,
      event: "key_updated",
      outcome: "success",
      reason: "key_updated",
      key_prefix: result.record.key_prefix,
      api_key_id: id,
      ip,
      user_agent: userAgent,
      endpoint,
      http_status: 200,
      error_summary: `Changed fields: ${result.changedFields.join(", ")}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: result.record.id,
        name: result.record.name,
        keyPrefix: result.record.key_prefix,
        phoneNumberId: result.record.phone_number_id,
        allowedRecipients: result.record.allowed_recipients,
        rateLimitPerMinute: result.record.rate_limit_per_minute,
        expiresAt: result.record.expires_at,
        changedFields: result.changedFields,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: { code: "SERVER_ERROR", message: errorMsg } }, { status: 500 });
  }
}
