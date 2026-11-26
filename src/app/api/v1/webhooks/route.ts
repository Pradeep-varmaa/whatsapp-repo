import { NextRequest, NextResponse } from "next/server";
import { WebhookRepository } from "@/server/repositories/webhookRepository";
import { ApiResponse } from "@/shared/types";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // 'events' | 'deliveries'
    const projectId = searchParams.get("projectId") || undefined;

    const repo = new WebhookRepository();

    if (type === "deliveries") {
      const deliveries = await repo.findAllDeliveries(projectId);
      return NextResponse.json({
        success: true,
        data: deliveries,
        meta: { total: deliveries.length, correlationId, timestamp: new Date().toISOString() },
      } satisfies ApiResponse);
    }

    const events = await repo.findAllEvents();
    return NextResponse.json({
      success: true,
      data: events,
      meta: { total: events.length, correlationId, timestamp: new Date().toISOString() },
    } satisfies ApiResponse);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "WEBHOOK_DATA_FETCH_FAILED", message: error.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}
