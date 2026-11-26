import { NextRequest, NextResponse } from "next/server";
import { getMetaGraphApiClient } from "@/server/integrations/meta/graphApiClient";
import { getServerConfig } from "@/server/config";
import { requireAuth } from "@/server/security/guards";
import { PERMISSIONS } from "@/server/security/permissions";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();

  const auth = await requireAuth(req, PERMISSIONS.WHATSAPP_LIVE_VIEW);
  if (auth instanceof NextResponse) return auth;

  try {
    const config = getServerConfig();
    const wabaId = config.WHATSAPP_WABA_ID;
    const client = getMetaGraphApiClient();

    const { numbers, fetchedAt } = await client.getLivePhoneNumbers(wabaId);

    return NextResponse.json({
      success: true,
      data: {
        wabaId,
        numbers,
        count: numbers.length,
      },
      meta: {
        fetchedAt,
        correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: error.code || "PHONE_NUMBERS_FETCH_FAILED", message: error.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: error.status || 502 }
    );
  }
}
