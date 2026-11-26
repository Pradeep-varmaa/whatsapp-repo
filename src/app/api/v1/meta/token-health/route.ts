import { NextRequest, NextResponse } from "next/server";
import { getMetaGraphApiClient } from "@/server/integrations/meta/graphApiClient";
import { requireAuth } from "@/server/security/guards";
import { PERMISSIONS } from "@/server/security/permissions";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();

  // Authentication & RBAC Check
  const auth = await requireAuth(req, PERMISSIONS.WHATSAPP_LIVE_VIEW);
  if (auth instanceof NextResponse) return auth;

  try {
    const client = getMetaGraphApiClient();
    const tokenHealth = await client.debugToken();

    return NextResponse.json({
      success: true,
      data: tokenHealth,
      meta: {
        correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "TOKEN_HEALTH_FAILED", message: error.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 502 }
    );
  }
}
