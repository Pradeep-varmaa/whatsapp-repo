import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { MessagingService } from "@/server/services/messagingService";
import { requireAuth } from "@/server/security/guards";
import { auditService } from "@/server/services/auditService";
import { logger } from "@/server/security/logger";
import { MetaGraphApiError } from "@/server/integrations/meta/graphApiClient";

const RegisterPhoneNumberSchema = z.object({
  phoneNumberId: z
    .string()
    .trim()
    .min(1, "Phone Number ID is required."),
  pin: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Two-step verification PIN must be exactly 6 digits."),
  projectId: z.string().trim().optional().nullable(),
  isDefault: z.boolean().optional().default(false),
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
          message: "Only administrators and superadministrators can register phone numbers.",
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

  const parseResult = RegisterPhoneNumberSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: firstIssue?.message || "Invalid registration inputs.",
          details: parseResult.error.flatten(),
        },
        meta: { correlationId, timestamp },
      },
      { status: 400 }
    );
  }

  const { phoneNumberId, pin, projectId, isDefault } = parseResult.data;

  try {
    // Note: NEVER log or store PIN
    const messagingService = new MessagingService();
    const result = await messagingService.registerPhoneNumber({
      phoneNumberId,
      pin,
      projectId: projectId || undefined,
      isDefault,
    });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "";
    await auditService.record({
      request_id: correlationId,
      event: "phone_number_registered",
      outcome: "success",
      reason: "admin_registered_number",
      ip,
      user_agent: userAgent,
      endpoint: "/api/phone-numbers/register",
      http_status: 200,
      error_summary: `Registered phone number ID ${phoneNumberId}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        phoneNumberId,
        registered: true,
        phoneNumber: result.phoneNumber,
      },
      meta: {
        correlationId,
        timestamp,
      },
    });
  } catch (err: any) {
    // Note: Do NOT log the PIN here!
    logger.error("Failed to register phone number with Meta", {
      correlationId,
      phoneNumberId,
      projectId,
      isDefault,
      error: err.message,
      metaErrorCode: err instanceof MetaGraphApiError ? err.metaErrorCode : undefined,
    });

    const isMeta = err instanceof MetaGraphApiError;
    const statusCode = isMeta && err.status >= 400 && err.status < 600 ? err.status : 500;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isMeta ? err.code : "REGISTRATION_FAILED",
          message: err.message || "Failed to register phone number with Meta Cloud API.",
        },
        meta: { correlationId, timestamp },
      },
      { status: statusCode }
    );
  }
}
