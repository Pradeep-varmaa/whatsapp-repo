import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/security/guards";
import { PERMISSIONS } from "@/server/security/permissions";
import { getServerConfig } from "@/server/config";
import { MessagingService } from "@/server/services/messagingService";
import { WorkflowTriggerMatcher } from "@/server/workflows/triggerMatcher";
import { executeQuery, sql } from "@/server/database/connection";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, PERMISSIONS.FLOWS_RUN);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const senderPhone = String(body?.senderPhone || "").trim();
  const messageText = String(body?.messageText || "").trim();
  const replyId = body?.replyId ? String(body.replyId) : null;
  const projectId = String(body?.projectId || auth.user.activeProjectId || "default");
  const phoneNumberId = String(body?.phoneNumberId || getServerConfig().PHONE_NUMBER_ID || "sim_phone_1");

  if (!senderPhone || !messageText) {
    return NextResponse.json(
      { success: false, error: "senderPhone and messageText are required" },
      { status: 400 }
    );
  }

  const wamid = `wamid.sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // 1. Open 24-hour customer care window
  MessagingService.recordInboundInteraction(phoneNumberId, senderPhone);

  // 2. Persist simulated inbound message so it appears in Live Inbox
  try {
    await executeQuery(
      `INSERT INTO WA_MESSAGES (message_id, wamid, project_id, phone_number_id, customer_id, direction, message_type, content_text, status, retry_count, is_mock, created_at, updated_at)
       VALUES (@id, @wamid, @projId, @phoneId, @custId, 'inbound', 'text', @content, 'delivered', 0, 1, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      {
        id: { type: sql.NVarChar(64), value: `sim_${Date.now()}` },
        wamid: { type: sql.NVarChar(128), value: wamid },
        projId: { type: sql.NVarChar(64), value: projectId },
        phoneId: { type: sql.NVarChar(64), value: phoneNumberId },
        custId: { type: sql.NVarChar(64), value: `cust_${senderPhone.replace(/\D/g, "")}` },
        content: { type: sql.NVarChar(sql.MAX), value: messageText },
      }
    );
  } catch {
    // Non-fatal in mock/offline DB mode
  }

  // 3. Trigger Workflow Engine synchronously so developer sees immediate outcome
  let workflowTriggered = false;
  try {
    await WorkflowTriggerMatcher.processIncoming({
      projectId,
      phoneNumberId,
      customerPhone: senderPhone,
      messageText,
      replyId,
      wamid,
    });
    workflowTriggered = true;
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        wamid,
        workflowTriggered: false,
        error: err?.message || "Workflow trigger failed",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    wamid,
    workflowTriggered,
    message: "Simulated inbound webhook processed, 24h window opened, and workflows evaluated.",
  });
}
