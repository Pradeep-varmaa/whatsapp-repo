import { NextRequest, NextResponse } from "next/server";
import { getMetaGraphApiClient } from "@/server/integrations/meta/graphApiClient";
import { getServerConfig } from "@/server/config";
import { requireAuth } from "@/server/security/guards";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const config = getServerConfig();
    const wabaId = config.WHATSAPP_WABA_ID || "315448454992777";
    const client = getMetaGraphApiClient();

    let templates: any[] = [];
    try {
      const res = await client.getLiveTemplates(wabaId);
      templates = res.templates || [];
    } catch (err: any) {
      console.warn("[Templates] Meta templates fetch error:", err.message);
    }

    return NextResponse.json({
      success: true,
      data: templates,
      meta: { total: templates.length, correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "TEMPLATES_FETCH_FAILED", message: err.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}
