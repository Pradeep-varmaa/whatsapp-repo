import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/security/guards";
import { PERMISSIONS } from "@/server/security/permissions";
import { executeQuery, sql } from "@/server/database/connection";
import { MessagingService } from "@/server/services/messagingService";
import { getServerConfig } from "@/server/config";

const messagingService = new MessagingService();

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, PERMISSIONS.WHATSAPP_LIVE_VIEW);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId");
  const phoneNumberId = searchParams.get("phoneNumberId") || getServerConfig().PHONE_NUMBER_ID || "";
  const projectId = searchParams.get("projectId");

  if (customerId) {
    try {
      const messages = await executeQuery<any>(
        `SELECT TOP 100 message_id, wamid, project_id, phone_number_id, customer_id,
                direction, message_type, content_text, template_name, status,
                error_message, created_at, updated_at
         FROM WA_MESSAGES
         WHERE customer_id = @custId
         ORDER BY created_at ASC`,
        { custId: { type: sql.NVarChar(64), value: customerId } }
      );

      const lastInbound = [...(messages || [])]
        .reverse()
        .find((m) => m.direction === "inbound");
      const lastInboundAt = lastInbound?.created_at ? new Date(lastInbound.created_at).toISOString() : null;
      const windowExpiresAt = lastInboundAt
        ? new Date(new Date(lastInboundAt).getTime() + 24 * 3600 * 1000).toISOString()
        : null;
      const isWindowOpen = Boolean(windowExpiresAt && new Date(windowExpiresAt).getTime() > Date.now());

      return NextResponse.json({
        success: true,
        customerId,
        messages: messages || [],
        window: {
          isOpen: isWindowOpen,
          lastInboundAt,
          expiresAt: windowExpiresAt,
        },
      });
    } catch {
      return NextResponse.json({
        success: true,
        customerId,
        messages: [],
        window: { isOpen: false, lastInboundAt: null, expiresAt: null },
      });
    }
  }

  // List recent conversations grouped by customer_id
  try {
    let query = `
      WITH RankedMessages AS (
        SELECT
          customer_id,
          phone_number_id,
          project_id,
          content_text,
          direction,
          status,
          created_at,
          ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) AS rn,
          MAX(CASE WHEN direction = 'inbound' THEN created_at ELSE NULL END)
            OVER (PARTITION BY customer_id) AS last_inbound_at
        FROM WA_MESSAGES
        WHERE 1=1
    `;
    const params: Record<string, { type: sql.ISqlType; value: any }> = {};
    if (projectId) {
      query += ` AND project_id = @projectId`;
      params.projectId = { type: sql.NVarChar(64), value: projectId };
    }
    if (phoneNumberId) {
      query += ` AND phone_number_id = @phoneId`;
      params.phoneId = { type: sql.NVarChar(64), value: phoneNumberId };
    }
    query += `
      )
      SELECT TOP 50
        customer_id, phone_number_id, project_id, content_text AS last_message,
        direction AS last_direction, status AS last_status, created_at AS last_message_at,
        last_inbound_at
      FROM RankedMessages
      WHERE rn = 1
      ORDER BY created_at DESC
    `;

    const rows = await executeQuery<any>(query, params);
    const conversations = (rows || []).map((r: any) => {
      const lastInboundMs = r.last_inbound_at ? new Date(r.last_inbound_at).getTime() : 0;
      const expiresAtMs = lastInboundMs ? lastInboundMs + 24 * 3600 * 1000 : 0;
      return {
        customerId: r.customer_id,
        customerPhone: String(r.customer_id || "").replace(/^cust_/, "+"),
        phoneNumberId: r.phone_number_id,
        projectId: r.project_id,
        lastMessage: r.last_message || "",
        lastDirection: r.last_direction,
        lastStatus: r.last_status,
        lastMessageAt: r.last_message_at,
        windowOpen: expiresAtMs > Date.now(),
        windowExpiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
      };
    });

    return NextResponse.json({ success: true, conversations });
  } catch {
    return NextResponse.json({ success: true, conversations: [] });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, PERMISSIONS.WHATSAPP_CONNECTION_MANAGE);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const recipientPhone = String(body?.recipientPhone || "").trim();
  const text = String(body?.text || "").trim();
  const phoneNumberId = body?.phoneNumberId || getServerConfig().PHONE_NUMBER_ID;
  const projectId = body?.projectId || auth.user.activeProjectId || "default";

  if (!recipientPhone || !text) {
    return NextResponse.json({ success: false, error: "recipientPhone and text are required" }, { status: 400 });
  }

  try {
    const sent = await messagingService.sendMessage({
      recipientPhone,
      phoneNumberId,
      projectId,
      messageType: "text",
      contentText: text,
      isTestSendOverride: true,
    });
    return NextResponse.json({ success: true, message: sent });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to send reply" },
      { status: 500 }
    );
  }
}
