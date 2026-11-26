import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/security/guards";
import { AuditLogRepository } from "@/server/repositories/auditLogRepository";

export async function GET(req: NextRequest) {
  // 1. Enforce admin / superadmin only
  const authUser = await authenticateRequest(req);
  if (!authUser) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
  }

  if (authUser.role !== "admin" && authUser.role !== "superadmin") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Administrator permissions required" } }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const outcome = searchParams.get("outcome") || undefined;
  const event = searchParams.get("event") || undefined;
  const keyPrefix = searchParams.get("keyPrefix") || undefined;
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  const repo = new AuditLogRepository();
  const { logs, total } = await repo.find({
    outcome,
    event,
    keyPrefix,
    startDate,
    endDate,
    page,
    limit,
  });

  return NextResponse.json({
    success: true,
    data: logs,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      timestamp: new Date().toISOString(),
    },
  });
}
