import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { MessagingService } from "@/server/services/messagingService";
import { requireAuth } from "@/server/security/guards";
import { auditService } from "@/server/services/auditService";
import { logger } from "@/server/security/logger";
import { MetaGraphApiError } from "@/server/integrations/meta/graphApiClient";

const RequestCodeSchema = z.object({
  phoneNumberId: z
    .string()
    .trim()
    .min(1, "Phone Number ID is required."),
  method: z.enum(["SMS", "VOICE"]),
  language: z
    .string()
    .trim()
    .min(2, "Language code must be at least 2 characters (e.g., 'en_US').")
    .default("en_US"),
});

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  // 1. Role verification: Only admin and superadmin
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role !== "admin" && auth.user.role !== "superadmin") {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Only administrators and superadministrators can request verification codes.",
        },
        meta: { correlationId, timestamp },
      },
      { status: 403 }
    );
  }

  // 2. Parse & validate body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: "INVALID_JSON", message: "Request body must be valid JSON." },
        meta: { correlationId, timestamp },
      },
      { status: 400 }
    );
  }

  const parseResult = RequestCodeSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: firstIssue?.message || "Invalid request code inputs.",
          details: parseResult.error.flatten(),
        },
        meta: { correlationId, timestamp },
      },
      { status: 400 }
    );
  }

  const { phoneNumberId, method, language } = parseResult.data;

  try {
    const messagingService = new MessagingService();
    await messagingService.requestCode({
      phoneNumberId,
      method,
      language,
    });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "";
    await auditService.record({
      request_id: correlationId,
      event: "phone_number_code_requested",
      outcome: "success",
      reason: `requested_via_${method}`,
      ip,
      user_agent: userAgent,
      endpoint: "/api/phone-numbers/request-code",
      http_status: 200,
      error_summary: `Requested verification code via ${method} for phone ID ${phoneNumberId}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        phoneNumberId,
        method,
        codeSent: true,
      },
      meta: {
        correlationId,
        timestamp,
      },
    });
  } catch (err: any) {
    logger.error("Failed to request verification code from Meta", {
      correlationId,
      phoneNumberId,
      method,
      error: err.message,
      metaErrorCode: err instanceof MetaGraphApiError ? err.metaErrorCode : undefined,
    });

    const isMeta = err instanceof MetaGraphApiError;
    const statusCode = isMeta && err.status >= 400 && err.status < 600 ? err.status : 500;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isMeta ? err.code : "REQUEST_CODE_FAILED",
          message: err.message || "Failed to request verification code from Meta.",
        },
        meta: { correlationId, timestamp },
      },
      { status: statusCode }
    );
  }
}
