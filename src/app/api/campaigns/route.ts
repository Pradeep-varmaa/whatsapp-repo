import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/security/guards";
import { PERMISSIONS } from "@/server/security/permissions";
import { executeQuery, sql } from "@/server/database/connection";
import { getServerConfig } from "@/server/config";
import { enqueueOutboundMessage } from "@/server/queues/queueManager";
import { normalizePhoneE164, isValidE164 } from "@/server/security/crypto";

export interface CampaignRecord {
  id: string;
  project_id: string;
  phone_number_id: string;
  name: string;
  template_name: string;
  template_language: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  rate_limit_mps: number;
  created_at: string;
}

const g = globalThis as unknown as { __inMemoryCampaigns?: CampaignRecord[] };
const inMemoryCampaigns = (g.__inMemoryCampaigns ??= []);

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, PERMISSIONS.WHATSAPP_LIVE_VIEW);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  try {
    let query = `SELECT TOP 50 * FROM campaigns WHERE 1=1`;
    const params: Record<string, { type: sql.ISqlType; value: any }> = {};
    if (projectId) {
      query += ` AND project_id = @projectId`;
      params.projectId = { type: sql.NVarChar(64), value: projectId };
    }
    query += ` ORDER BY created_at DESC`;
    const rows = await executeQuery<CampaignRecord>(query, params);
    return NextResponse.json({ success: true, campaigns: rows || inMemoryCampaigns });
  } catch {
    return NextResponse.json({ success: true, campaigns: inMemoryCampaigns });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, PERMISSIONS.WHATSAPP_CONNECTION_MANAGE);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || "").trim();
  const templateName = String(body?.templateName || "").trim();
  const templateLanguage = String(body?.templateLanguage || "en_US").trim();
  const projectId = String(body?.projectId || auth.user.activeProjectId || "default");
  const phoneNumberId = String(body?.phoneNumberId || getServerConfig().PHONE_NUMBER_ID || "");
  const rateLimitMps = Math.max(1, Math.min(80, Number(body?.rateLimitMps || 10)));
  const rawRecipients: Array<{ phone: string; variables?: Record<string, string> }> = Array.isArray(body?.recipients)
    ? body.recipients
    : [];

  if (!name || !templateName || rawRecipients.length === 0) {
    return NextResponse.json(
      { success: false, error: "name, templateName, and at least one recipient are required" },
      { status: 400 }
    );
  }

  const validRecipients = rawRecipients
    .map((r) => ({
      phone: normalizePhoneE164(String(r.phone || "")),
      variables: r.variables || {},
    }))
    .filter((r) => isValidE164(r.phone));

  if (validRecipients.length === 0) {
    return NextResponse.json(
      { success: false, error: "No valid E.164 recipient phone numbers found" },
      { status: 400 }
    );
  }

  const campaignId = `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  const campaign: CampaignRecord = {
    id: campaignId,
    project_id: projectId,
    phone_number_id: phoneNumberId,
    name,
    template_name: templateName,
    template_language: templateLanguage,
    status: "running",
    total_recipients: validRecipients.length,
    sent_count: 0,
    delivered_count: 0,
    failed_count: 0,
    rate_limit_mps: rateLimitMps,
    created_at: now,
  };

  try {
    await executeQuery(
      `INSERT INTO campaigns (id, project_id, phone_number_id, name, template_name, template_language, status, total_recipients, rate_limit_mps, started_at, created_by, created_at, updated_at)
       VALUES (@id, @proj, @phone, @name, @tpl, @lang, 'running', @total, @mps, SYSUTCDATETIME(), @createdBy, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      {
        id: { type: sql.NVarChar(64), value: campaignId },
        proj: { type: sql.NVarChar(64), value: projectId },
        phone: { type: sql.NVarChar(64), value: phoneNumberId },
        name: { type: sql.NVarChar(150), value: name },
        tpl: { type: sql.NVarChar(150), value: templateName },
        lang: { type: sql.NVarChar(20), value: templateLanguage },
        total: { type: sql.Int, value: validRecipients.length },
        mps: { type: sql.Int, value: rateLimitMps },
        createdBy: { type: sql.NVarChar(64), value: auth.user.userId },
      }
    );
  } catch {
    // Fallback in memory
  }

  inMemoryCampaigns.unshift(campaign);

  // Enqueue each recipient into BullMQ outbound-messages queue
  let queued = 0;
  for (const recipient of validRecipients) {
    const messageId = `cmpmsg_${campaignId}_${queued}_${Date.now()}`;
    try {
      await executeQuery(
        `INSERT INTO campaign_recipients (id, campaign_id, recipient_phone, variables_json, status, message_id, updated_at)
         VALUES (@id, @cmpId, @phone, @vars, 'queued', @msgId, SYSUTCDATETIME())`,
        {
          id: { type: sql.NVarChar(64), value: `cr_${Date.now()}_${queued}` },
          cmpId: { type: sql.NVarChar(64), value: campaignId },
          phone: { type: sql.NVarChar(50), value: recipient.phone },
          vars: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(recipient.variables) },
          msgId: { type: sql.NVarChar(64), value: messageId },
        }
      );
    } catch {}

    await enqueueOutboundMessage({
      messageId,
      projectId,
      phoneNumberId,
      recipientPhone: recipient.phone,
      messageType: "template",
      templateName,
      templateLanguage,
      templateParameters: Object.keys(recipient.variables).length > 0 ? recipient.variables : null,
    });
    queued++;
  }

  campaign.sent_count = queued;

  return NextResponse.json({
    success: true,
    campaign,
    queuedRecipients: queued,
  });
}
