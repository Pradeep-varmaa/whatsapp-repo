import { NextRequest, NextResponse } from "next/server";
import { getMetaGraphApiClient } from "@/server/integrations/meta/graphApiClient";
import { getWhatsAppDataService } from "@/server/services/whatsappDataService";
import { requireAuth } from "@/server/security/guards";
import { PERMISSIONS } from "@/server/security/permissions";
import { auditService } from "@/server/services/auditService";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const auth = await requireAuth(req, PERMISSIONS.WHATSAPP_CONNECTION_MANAGE);
  if (auth instanceof NextResponse) return auth;

  try {
    let body: any;
    try {
      body = await req.json();
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

    const { phoneNumberId } = body || {};

    if (!phoneNumberId || typeof phoneNumberId !== "string" || !phoneNumberId.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "phoneNumberId is required." },
          meta: { correlationId, timestamp },
        },
        { status: 400 }
      );
    }

    const cleanPhoneId = phoneNumberId.trim();
    const metaClient = getMetaGraphApiClient();
    const service = getWhatsAppDataService();

    // Call Meta Graph API: POST /{PHONE_NUMBER_ID}/deregister
    const result = await metaClient.deregisterPhoneNumber(cleanPhoneId);

    // Unassign from MSSQL
    try {
      await service.assignPhoneNumberToProject(cleanPhoneId, null, false);
    } catch {
      // Ignore
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "";
    await auditService.record({
      request_id: correlationId,
      event: "phone_number_deregistered",
      outcome: "success",
      reason: "admin_deregistered_number",
      ip,
      user_agent: userAgent,
      endpoint: "/api/phone-numbers/deregister",
      http_status: 200,
      error_summary: `Deregistered phone number ID ${cleanPhoneId}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        phoneNumberId: cleanPhoneId,
        deregistered: true,
        metaResult: result.data,
      },
      meta: {
        correlationId,
        timestamp,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code || "PHONE_DEREGISTRATION_FAILED",
          message: error.message || "Failed to deregister phone number from Meta Graph API.",
        },
        meta: { correlationId, timestamp },
      },
      { status: error.status || 500 }
    );
  }
}
