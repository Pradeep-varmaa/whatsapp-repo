import { NextRequest, NextResponse } from "next/server";
import { RequestLogRepository } from "@/server/repositories/requestLogRepository";
import { ApiResponse } from "@/shared/types";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const { searchParams } = new URL(req.url);
    const source = (searchParams.get("source") as "server" | "user") || undefined;
    const direction = (searchParams.get("direction") as "outbound" | "inbound") || undefined;
    const search = searchParams.get("search") || undefined;

    const repo = new RequestLogRepository();
    const logs = await repo.findAll({ source, direction, search });

    return NextResponse.json({
      success: true,
      data: logs,
      meta: {
        total: logs.length,
        correlationId,
        timestamp: new Date().toISOString(),
      },
    } satisfies ApiResponse);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "REQUEST_LOGS_FETCH_FAILED", message: error.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}
