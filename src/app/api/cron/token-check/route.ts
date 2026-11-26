import { NextRequest, NextResponse } from "next/server";
import { getMetaGraphApiClient } from "@/server/integrations/meta/graphApiClient";
import { getServerConfig } from "@/server/config";
import { timingSafeCompare } from "@/server/security/crypto";
import { auditService } from "@/server/services/auditService";
import { logger } from "@/server/security/logger";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const config = getServerConfig();

  // 1. Verify CRON_SECRET via header or query parameter
  const authHeader = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  const { searchParams } = new URL(req.url);
  const querySecret = searchParams.get("secret");

  const providedSecret = authHeader || querySecret;
  if (!providedSecret || !timingSafeCompare(providedSecret, config.CRON_SECRET)) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing cron secret." } },
      { status: 401 }
    );
  }

  // 2. Perform live token check
  const client = getMetaGraphApiClient();
  const health = await client.debugToken();

  if (!health.isValid) {
    logger.error("CRON TICK: Meta Access Token is INVALID or EXPIRED (Error 190).", health.error);

    await auditService.record({
      request_id: correlationId,
      event: "token_health_alert",
      outcome: "failure",
      reason: "meta_token_expired_or_invalid",
      endpoint: "/api/cron/token-check",
      http_status: 401,
      error_summary: health.error || "Meta Access Token is invalid or expired",
    });

    return NextResponse.json({
      success: false,
      status: "REAUTH_REQUIRED",
      message: "Meta Access Token is invalid or expired. Sends paused.",
      data: health,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  }

  return NextResponse.json({
    success: true,
    status: "HEALTHY",
    data: health,
    meta: { correlationId, timestamp: new Date().toISOString() },
  });
}
