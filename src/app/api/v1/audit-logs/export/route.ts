import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/security/guards";
import { AuditLogRepository } from "@/server/repositories/auditLogRepository";

export async function GET(req: NextRequest) {
  // 1. Enforce superadmin ONLY for CSV export
  const authUser = await authenticateRequest(req);
  if (!authUser) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
  }

  if (authUser.role !== "superadmin") {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Superadmin role required to export audit log CSV." } },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const outcome = searchParams.get("outcome") || undefined;
  const event = searchParams.get("event") || undefined;
  const keyPrefix = searchParams.get("keyPrefix") || undefined;
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;

  const repo = new AuditLogRepository();
  const csvData = await repo.exportCsv({
    outcome,
    event,
    keyPrefix,
    startDate,
    endDate,
  });

  const filename = `wae_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csvData, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
