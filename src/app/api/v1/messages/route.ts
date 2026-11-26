import { NextRequest, NextResponse } from "next/server";
import { MessagingService } from "@/server/services/messagingService";
import { ApiKeyRepository } from "@/server/repositories/apiKeyRepository";
import { RateLimiter } from "@/server/security/rateLimiter";
import { verifyApiKeyHash, maskRecipientPhone, normalizePhoneE164, isValidE164 } from "@/server/security/crypto";
import { auditService } from "@/server/services/auditService";
import { requireAuth, assertProjectAccess, authenticateRequest } from "@/server/security/guards";
import { getServerConfig } from "@/server/config";
import { PERMISSIONS } from "@/server/security/permissions";
import { MetaGraphApiError } from "@/server/integrations/meta/graphApiClient";
import { logger } from "@/server/security/logger";
import { z } from "zod";
import crypto from "crypto";

const publicMessageSchema = z
  .object({
    to: z
      .string()
      .transform(normalizePhoneE164)
      .refine(isValidE164, {
        message: "Recipient must be a valid E.164 phone number (e.g. +15551234567 or +919014683627)",
      }),
    type: z.enum(["text", "template", "image", "document", "audio", "video", "interactive"]),
    text: z.string().optional(),
    template: z
      .object({
        name: z.string().min(1, "Template name is required"),
        language: z
          .union([
            z.string(),
            z.object({ code: z.string() }).transform((v) => v.code),
          ])
          .default("en_US"),
        components: z.array(z.any()).optional(),
      })
      .optional(),
    media: z
      .object({
        url: z.string().url().optional(),
        id: z.string().min(1).optional(),
        caption: z.string().max(1024).optional(),
        filename: z.string().max(255).optional(),
      })
      .optional(),
    interactive: z
      .object({
        kind: z.enum(["buttons", "list"]),
        text: z.string().min(1),
        buttons: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
        buttonText: z.string().optional(),
        sections: z
          .array(
            z.object({
              title: z.string(),
              rows: z.array(z.object({ id: z.string(), title: z.string(), description: z.string().optional() })),
            })
          )
          .optional(),
      })
      .optional(),
    idempotencyKey: z.string().max(128).optional(),
  })
  .refine(
    (data) => {
      if (data.type === "text") {
        return Boolean(data.text && data.text.trim().length > 0);
      }
      if (data.type === "template") {
        return Boolean(data.template && data.template.name.trim().length > 0);
      }
      if (data.type === "image" || data.type === "document" || data.type === "audio" || data.type === "video") {
        return Boolean(data.media && (data.media.url || data.media.id));
      }
      if (data.type === "interactive") {
        return Boolean(data.interactive && data.interactive.text.trim().length > 0);
      }
      return false;
    },
    {
      message: "Invalid payload for the selected message type",
      path: ["type"],
    }
  );

export async function POST(req: NextRequest) {
  // Step 1: Generate a request_id; read IP and user agent
  const requestId = `req_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
  const userAgent = req.headers.get("user-agent") || "";
  const endpoint = "/api/v1/messages";

  // Step 2: Extract the key; look up by key_prefix; compare hashes with crypto.timingSafeEqual
  const authHeader = req.headers.get("authorization");
  let rawKey: string | null = null;

  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    rawKey = authHeader.slice(7).trim();
  } else {
    rawKey = req.headers.get("x-api-key")?.trim() || null;
  }

  const generic401 = () =>
    NextResponse.json(
      { error: "Unauthorized", message: "Invalid or missing API key", requestId },
      { status: 401 }
    );

  let matchedKey: any = null;
  const apiKeyRepo = new ApiKeyRepository();

  if (!rawKey) {
    // Check if called from dashboard session
    const sessionAuth = await authenticateRequest(req);
    if (sessionAuth && (sessionAuth.role === "admin" || sessionAuth.role === "superadmin")) {
      const allKeys = await apiKeyRepo.listAll();
      const activeKey = allKeys.find(
        (k) => !k.revoked_at && (!k.expires_at || new Date(k.expires_at).getTime() > Date.now())
      );
      if (activeKey) {
        matchedKey = activeKey;
      } else {
        const config = getServerConfig();
        matchedKey = {
          id: "session_user",
          name: "Dashboard Session",
          key_prefix: "session",
          key_hash: "",
          phone_number_id: config.PHONE_NUMBER_ID || "355139157678636",
          project_id: sessionAuth.projectIds[0] || null,
          scopes: ["messages:send"],
          allowed_recipients: [],
          rate_limit_per_minute: 1000,
          created_by: sessionAuth.userId,
          created_at: new Date().toISOString(),
          last_used_at: new Date().toISOString(),
          expires_at: null,
          revoked_at: null,
        };
      }
    } else {
      await auditService.record({
        request_id: requestId,
        event: "auth_failed",
        outcome: "failure",
        reason: "invalid_key",
        ip,
        user_agent: userAgent,
        endpoint,
        http_status: 401,
        error_summary: "No API key supplied in Authorization header or x-api-key",
      });
      return generic401();
    }
  } else {
    // Extract prefix for lookup (at least 8 chars)
    const keyPrefix = rawKey.slice(0, 16);
    const candidates = await apiKeyRepo.findByPrefix(keyPrefix);

    if (!candidates || candidates.length === 0) {
      await auditService.record({
        request_id: requestId,
        event: "auth_failed",
        outcome: "failure",
        reason: "invalid_key",
        key_prefix: rawKey.slice(0, 8),
        ip,
        user_agent: userAgent,
        endpoint,
        http_status: 401,
        error_summary: "No matching key prefix found",
      });
      return generic401();
    }

    // Compare hashes with crypto.timingSafeEqual
    for (const candidate of candidates) {
      if (verifyApiKeyHash(rawKey, candidate.key_hash)) {
        matchedKey = candidate;
        break;
      }
    }

    if (!matchedKey) {
      await auditService.record({
        request_id: requestId,
        event: "auth_failed",
        outcome: "failure",
        reason: "invalid_key",
        key_prefix: candidates[0]?.key_prefix || rawKey.slice(0, 8),
        api_key_id: candidates[0]?.id || null,
        ip,
        user_agent: userAgent,
        endpoint,
        http_status: 401,
        error_summary: "Constant-time key hash comparison failed",
      });
      return generic401();
    }
  }

  // Step 3: Reject if revoked, expired, or missing the messages:send scope
  if (matchedKey.revoked_at) {
    await auditService.record({
      request_id: requestId,
      event: "auth_failed",
      outcome: "failure",
      reason: "revoked",
      key_prefix: matchedKey.key_prefix,
      api_key_id: matchedKey.id,
      ip,
      user_agent: userAgent,
      endpoint,
      http_status: 401,
      error_summary: "API key has been revoked",
    });
    return NextResponse.json(
      { error: "Unauthorized", message: "API key has been revoked", requestId },
      { status: 401 }
    );
  }

  if (matchedKey.expires_at && new Date(matchedKey.expires_at).getTime() < Date.now()) {
    await auditService.record({
      request_id: requestId,
      event: "auth_failed",
      outcome: "failure",
      reason: "expired",
      key_prefix: matchedKey.key_prefix,
      api_key_id: matchedKey.id,
      ip,
      user_agent: userAgent,
      endpoint,
      http_status: 401,
      error_summary: "API key has expired",
    });
    return NextResponse.json(
      { error: "Unauthorized", message: "API key has expired", requestId },
      { status: 401 }
    );
  }

  if (!matchedKey.scopes || !matchedKey.scopes.includes("messages:send")) {
    await auditService.record({
      request_id: requestId,
      event: "forbidden",
      outcome: "failure",
      reason: "wrong_scope",
      key_prefix: matchedKey.key_prefix,
      api_key_id: matchedKey.id,
      ip,
      user_agent: userAgent,
      endpoint,
      http_status: 403,
      error_summary: "Key lacks required 'messages:send' scope",
    });
    return NextResponse.json(
      { error: "Forbidden", message: "API key lacks 'messages:send' scope", requestId },
      { status: 403 }
    );
  }

  // Step 4: Rate limit per key (return 429 with Retry-After)
  const rateLimit = RateLimiter.check(matchedKey.id, matchedKey.rate_limit_per_minute || 60);
  if (!rateLimit.allowed) {
    await auditService.record({
      request_id: requestId,
      event: "rate_limited",
      outcome: "failure",
      reason: "rate_limited",
      key_prefix: matchedKey.key_prefix,
      api_key_id: matchedKey.id,
      ip,
      user_agent: userAgent,
      endpoint,
      http_status: 429,
      error_summary: `Rate limit of ${matchedKey.rate_limit_per_minute} requests/min exceeded`,
    });
    return new NextResponse(
      JSON.stringify({
        error: "Too Many Requests",
        message: `Rate limit of ${matchedKey.rate_limit_per_minute} requests per minute exceeded`,
        retryAfter: rateLimit.retryAfterSeconds,
        requestId,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  // Step 5: Validate the body; reject recipients not in allowed_recipients
  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    await auditService.record({
      request_id: requestId,
      event: "validation_failed",
      outcome: "failure",
      reason: "validation_failed",
      key_prefix: matchedKey.key_prefix,
      api_key_id: matchedKey.id,
      ip,
      user_agent: userAgent,
      endpoint,
      http_status: 400,
      error_summary: "Invalid JSON body",
    });
    return NextResponse.json(
      { error: "Bad Request", message: "Malformed JSON payload", requestId },
      { status: 400 }
    );
  }

  const parsed = publicMessageSchema.safeParse(bodyJson);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join("; ");
    await auditService.record({
      request_id: requestId,
      event: "validation_failed",
      outcome: "failure",
      reason: "validation_failed",
      key_prefix: matchedKey.key_prefix,
      api_key_id: matchedKey.id,
      ip,
      user_agent: userAgent,
      endpoint,
      http_status: 400,
      error_summary: errorMsg,
    });
    return NextResponse.json(
      { error: "Bad Request", message: "Validation failed", details: parsed.error.format(), requestId },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const maskedPhone = maskRecipientPhone(payload.to);

  // Check allowed_recipients
  if (matchedKey.allowed_recipients && matchedKey.allowed_recipients.length > 0) {
    const normalizedTarget = normalizePhoneE164(payload.to);
    const normalizedAllowed = matchedKey.allowed_recipients.map(normalizePhoneE164);
    const isAllowed = normalizedAllowed.includes(normalizedTarget);

    if (!isAllowed) {
      await auditService.record({
        request_id: requestId,
        event: "forbidden",
        outcome: "failure",
        reason: "recipient_not_allowed",
        key_prefix: matchedKey.key_prefix,
        api_key_id: matchedKey.id,
        ip,
        user_agent: userAgent,
        endpoint,
        http_status: 403,
        recipient_masked: maskedPhone,
        error_summary: "Target phone number not permitted by key allowlist",
      });
      return NextResponse.json(
        { error: "Forbidden", message: "Recipient not permitted by API key restriction", requestId },
        { status: 403 }
      );
    }
  }

  // Step 6: 24-hour customer window validation for free text
  const messagingService = new MessagingService();

  if (payload.type === "text") {
    const insideWindow = await messagingService.isCustomerInside24hWindow(
      matchedKey.phone_number_id,
      payload.to
    );

    if (!insideWindow) {
      await auditService.record({
        request_id: requestId,
        event: "validation_failed",
        outcome: "failure",
        reason: "template_required",
        key_prefix: matchedKey.key_prefix,
        api_key_id: matchedKey.id,
        ip,
        user_agent: userAgent,
        endpoint,
        http_status: 422,
        recipient_masked: maskedPhone,
        error_summary: "Free-form text message rejected outside 24-hour customer care window",
      });
      return NextResponse.json(
        {
          error: "Unprocessable Entity",
          code: "TEMPLATE_REQUIRED",
          message: "Free text is only permitted within the 24-hour customer window. Please use type 'template'.",
          requestId,
        },
        { status: 422 }
      );
    }
  }

  // Step 7: Send through MessagingService using key's bound phone_number_id & honor idempotencyKey
  try {
    const result = await messagingService.sendMessage({
      phoneNumberId: matchedKey.phone_number_id,
      recipientPhone: payload.to,
      messageType: payload.type,
      contentText:
        payload.type === "text"
          ? payload.text
          : payload.type === "interactive"
            ? payload.interactive?.text
            : payload.media?.caption || null,
      templateName: payload.type === "template" ? payload.template?.name : null,
      templateLanguage: payload.type === "template" ? payload.template?.language || "en_US" : null,
      templateParameters: payload.type === "template" ? payload.template?.components : undefined,
      mediaUrl: payload.media?.url || null,
      mediaId: payload.media?.id || null,
      caption: payload.media?.caption || null,
      filename: payload.media?.filename || null,
      interactivePayload: payload.interactive || null,
      idempotencyKey: payload.idempotencyKey,
      projectId: matchedKey.project_id || undefined,
    });

    const metaMessageId = result.message.wamid || result.message.messageId;

    // Step 8: On success return 200 { requestId, messageId } with Meta message id
    await auditService.record({
      request_id: requestId,
      event: "message_sent",
      outcome: "success",
      reason: null,
      key_prefix: matchedKey.key_prefix,
      api_key_id: matchedKey.id,
      ip,
      user_agent: userAgent,
      endpoint,
      http_status: 200,
      recipient_masked: maskedPhone,
      meta_message_id: metaMessageId,
    });

    // Update last_used_at timestamp on key
    if (matchedKey.id && matchedKey.id !== "session_user") {
      await apiKeyRepo.updateLastUsed(matchedKey.id);
    }

    return NextResponse.json(
      {
        requestId,
        messageId: metaMessageId,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    // Step 9: Map Meta errors to safe messages; keep the raw error in server logs only
    const rawError = err instanceof Error ? err.message : String(err);
    logger.error("Meta Graph API delivery error:", { error: rawError, requestId });

    let httpStatus = 502;
    let safeMessage = "WhatsApp delivery service error";
    let errorCode = "META_ERROR";

    if (err instanceof MetaGraphApiError) {
      errorCode = err.code;
      if (err.metaErrorCode === 131047) {
        httpStatus = 422;
        errorCode = "TEMPLATE_REQUIRED";
        safeMessage = "Customer care window expired. Use a pre-approved WhatsApp template message.";
      } else if (err.metaErrorCode === 131030) {
        httpStatus = 403;
        errorCode = "RECIPIENT_NOT_ALLOWED";
        safeMessage = "Recipient phone number is not allowed in sandbox environment.";
      } else if (err.status === 429) {
        httpStatus = 429;
        errorCode = "RATE_LIMIT_EXCEEDED";
        safeMessage = "WhatsApp provider rate limit reached. Please retry later.";
      } else if (err.status >= 400 && err.status < 500) {
        httpStatus = err.status;
        safeMessage = err.message;
      }
    }

    await auditService.record({
      request_id: requestId,
      event: "meta_error",
      outcome: "failure",
      reason: errorCode.toLowerCase(),
      key_prefix: matchedKey.key_prefix,
      api_key_id: matchedKey.id,
      ip,
      user_agent: userAgent,
      endpoint,
      http_status: httpStatus,
      recipient_masked: maskedPhone,
      error_summary: safeMessage,
    });

    return NextResponse.json(
      {
        error: "Message Delivery Failed",
        code: errorCode,
        message: safeMessage,
        requestId,
      },
      { status: httpStatus }
    );
  }
}

// Retain dashboard GET messages handler
export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req, PERMISSIONS.FLOWS_VIEW);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") || undefined;
    const status = searchParams.get("status") || undefined;

    if (projectId && !assertProjectAccess(auth.user, projectId)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "You do not have access to messages in this project." },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 403 }
      );
    }

    const service = new MessagingService();
    const messages = await service.listMessages({ projectId, status });

    return NextResponse.json({
      success: true,
      data: messages,
      meta: {
        total: messages.length,
        correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "MESSAGES_FETCH_FAILED", message: error.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}
