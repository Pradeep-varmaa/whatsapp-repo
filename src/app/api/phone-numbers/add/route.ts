import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { MessagingService } from "@/server/services/messagingService";
import { requireAuth } from "@/server/security/guards";
import { auditService } from "@/server/services/auditService";
import { logger } from "@/server/security/logger";
import { MetaGraphApiError } from "@/server/integrations/meta/graphApiClient";

const AddPhoneNumberSchema = z.object({
  cc: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, "Country code must be 1 to 4 digits without leading '+' or special characters."),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\d{4,15}$/, "Phone number must be 4 to 15 digits (E.164 format without country code or leading zeros)."),
  verifiedName: z
    .string()
    .trim()
    .min(1, "Verified sender name is required.")
    .max(256, "Verified sender name cannot exceed 256 characters."),
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
          message: "Only administrators and superadministrators can add WhatsApp phone numbers.",
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

  const parseResult = AddPhoneNumberSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: firstIssue?.message || "Invalid phone number inputs.",
          details: parseResult.error.flatten(),
        },
        meta: { correlationId, timestamp },
      },
      { status: 400 }
    );
  }

  const { cc, phoneNumber, verifiedName } = parseResult.data;

  try {
    const messagingService = new MessagingService();
    const result = await messagingService.addPhoneNumber({
      cc,
      phoneNumber,
      verifiedName,
    });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "";
    await auditService.record({
      request_id: correlationId,
      event: "phone_number_added",
      outcome: "success",
      reason: "admin_added_number",
      ip,
      user_agent: userAgent,
      endpoint: "/api/phone-numbers/add",
      http_status: 200,
      error_summary: `Added phone number ID ${result.phoneNumberId} (${verifiedName})`,
    });

    return NextResponse.json({
      success: true,
      data: {
        phoneNumberId: result.phoneNumberId,
      },
      meta: {
        correlationId,
        timestamp,
      },
    });
  } catch (err: any) {
    // Keep raw Meta error in server logs only
    logger.error("Failed to add phone number to Meta WABA", {
      correlationId,
      error: err.message,
      metaErrorCode: err instanceof MetaGraphApiError ? err.metaErrorCode : undefined,
      status: err.status,
    });

    const isMeta = err instanceof MetaGraphApiError;
    const statusCode = isMeta && err.status >= 400 && err.status < 600 ? err.status : 500;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isMeta ? err.code : "PHONE_NUMBER_ADD_FAILED",
          message: err.message || "Failed to add phone number to WhatsApp Business Account.",
        },
        meta: { correlationId, timestamp },
      },
      { status: statusCode }
    );
  }
}
