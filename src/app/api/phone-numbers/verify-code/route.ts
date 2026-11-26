import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { MessagingService } from "@/server/services/messagingService";
import { requireAuth } from "@/server/security/guards";
import { auditService } from "@/server/services/auditService";
import { logger } from "@/server/security/logger";
import { MetaGraphApiError } from "@/server/integrations/meta/graphApiClient";

const VerifyCodeSchema = z.object({
  phoneNumberId: z
    .string()
    .trim()
    .min(1, "Phone Number ID is required."),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Verification code must be exactly 6 digits."),
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
          message: "Only administrators and superadministrators can verify phone numbers.",
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

  const parseResult = VerifyCodeSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: firstIssue?.message || "Invalid verification code.",
          details: parseResult.error.flatten(),
        },
        meta: { correlationId, timestamp },
      },
      { status: 400 }
    );
  }

  const { phoneNumberId, code } = parseResult.data;

  try {
    // Note: NEVER log code
    const messagingService = new MessagingService();
    await messagingService.verifyCode({
      phoneNumberId,
      code,
    });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "";
    await auditService.record({
      request_id: correlationId,
      event: "phone_number_code_verified",
      outcome: "success",
      reason: "code_verified",
      ip,
      user_agent: userAgent,
      endpoint: "/api/phone-numbers/verify-code",
      http_status: 200,
      error_summary: `Verified code for phone ID ${phoneNumberId}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        phoneNumberId,
        verified: true,
      },
      meta: {
        correlationId,
        timestamp,
      },
    });
  } catch (err: any) {
    // Note: Do NOT log the code here either!
    logger.error("Failed to verify code with Meta", {
      correlationId,
      phoneNumberId,
      error: err.message,
      metaErrorCode: err instanceof MetaGraphApiError ? err.metaErrorCode : undefined,
    });

    const isMeta = err instanceof MetaGraphApiError;
    const statusCode = isMeta && err.status >= 400 && err.status < 600 ? err.status : 500;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isMeta ? err.code : "VERIFY_CODE_FAILED",
          message: err.message || "Failed to verify phone number code with Meta.",
        },
        meta: { correlationId, timestamp },
      },
      { status: statusCode }
    );
  }
}
