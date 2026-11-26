import { NextRequest, NextResponse } from "next/server";
import { getServerConfig } from "@/server/config";
import { verifyMetaSignature, timingSafeCompare } from "@/server/security/crypto";
import { ReplyTriggerMatcher } from "@/server/engine/triggerMatcher";
import { WorkflowTriggerMatcher } from "@/server/workflows/triggerMatcher";
import { executeQuery, sql } from "@/server/database/connection";
import { logger } from "@/server/security/logger";
import { MessagingService } from "@/server/services/messagingService";
import { PhoneNumberRepository } from "@/server/repositories/phoneNumberRepository";
import { ProjectRepository } from "@/server/repositories/projectRepository";
import { RequestLogRepository } from "@/server/repositories/requestLogRepository";
import { WebhookRepository } from "@/server/repositories/webhookRepository";
import {
  forwardInboundMessageToProjectWebhook,
  forwardStatusUpdateToProjectWebhook,
} from "@/server/services/webhookDispatcher";
import crypto from "crypto";

const processedEventCache = new Set<string>();
const triggerMatcher = new ReplyTriggerMatcher();
const phoneRepo = new PhoneNumberRepository();
const projectRepo = new ProjectRepository();
const requestLogRepo = new RequestLogRepository();
const webhookRepo = new WebhookRepository();

/**
 * GET: Handles Meta Webhook Verification Challenge with timing-safe comparison
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const config = getServerConfig();
  const configuredToken = config.WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token && challenge) {
    if (timingSafeCompare(token, configuredToken)) {
      return new NextResponse(challenge, { status: 200 });
    }
  }

  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * POST: Signed Meta Webhook processor with HMAC-SHA256 verification and reply trigger orchestration
 */
export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const rawBody = await req.text();
    const config = getServerConfig();

    // 1. Mandatory HMAC-SHA256 verification against raw body
    const signature = req.headers.get("x-hub-signature-256");
    const isSignatureValid = verifyMetaSignature(rawBody, signature, config.APP_SECRET);

    if (!isSignatureValid) {
      logger.warn(`[Webhook] Unsigned or invalid X-Hub-Signature-256 rejected.`);
      return NextResponse.json({ error: "Invalid or missing HMAC signature" }, { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    // 1. Print formatted incoming Meta Webhook data to the server terminal
    // console.log("\n=======================================================");
    // console.log("📥 [META WHATSAPP WEBHOOK RECEIVED]");
    // console.log("⏰ Time:", new Date().toISOString());
    // console.log("🔐 X-Hub-Signature-256:", signature ? `${signature.slice(0, 20)}...` : "(none)");
    // console.log("📦 Full Meta Payload:\n" + JSON.stringify(payload, null, 2));
    // console.log("=======================================================\n");

    // 2. Persist raw event in WebhookRepository (for Dashboard & CLI inspection)
    const eventId = `ev_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    let detectedEventType = "whatsapp_event";
    let firstPhoneId: string | null = null;
    let firstWabaId: string | null = null;

    for (const entry of payload.entry || []) {
      if (entry.id) firstWabaId = entry.id;
      for (const change of entry.changes || []) {
        if (change.field) detectedEventType = change.field;
        if (change.value?.metadata?.phone_number_id) {
          firstPhoneId = change.value.metadata.phone_number_id;
        }
      }
    }

    await webhookRepo.saveEvent({
      eventId,
      metaEventId: payload.entry?.[0]?.id || null,
      eventType: detectedEventType,
      phoneNumberId: firstPhoneId,
      wabaId: firstWabaId,
      payload,
      processingStatus: "processed",
      receivedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    });

    // Respond 200 OK immediately to Meta, process payload safely
    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const val = change.value;
        if (!val) continue;

        // Process Inbound Customer Messages
        const messages = val.messages || [];
        for (const msg of messages) {
          const wamid = msg.id;
          if (!wamid) continue;

          // Event Deduplication
          if (processedEventCache.has(wamid)) {
            continue;
          }
          processedEventCache.add(wamid);
          if (processedEventCache.size > 10000) {
            // Keep memory bounded
            processedEventCache.clear();
          }

          const senderPhone = msg.from;
          const receiverPhoneId = val.metadata?.phone_number_id || "";

          // Extract text and interactive reply ID (button_reply or list_reply)
          let text = msg.text?.body || msg.caption || "";
          let interactiveReplyId: string | null = null;

          if (msg.type === "interactive" && msg.interactive) {
            if (msg.interactive.type === "button_reply") {
              interactiveReplyId = msg.interactive.button_reply?.id || null;
              text = msg.interactive.button_reply?.title || text || interactiveReplyId || "";
            } else if (msg.interactive.type === "list_reply") {
              interactiveReplyId = msg.interactive.list_reply?.id || null;
              text = msg.interactive.list_reply?.title || text || interactiveReplyId || "";
            }
          }

          if (!text) {
            text = interactiveReplyId || "[Media Message]";
          }

          const timestamp = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString();

          // console.log(`💬 Inbound Message from +${senderPhone.replace(/\D/g, "")}: "${text}" (WAMID: ${wamid})`);

          // Open 24-hour customer care window for this customer
          MessagingService.recordInboundInteraction(receiverPhoneId, senderPhone);

          // Resolve project mapped to the receiver phone number
          let targetProjectId: string = "default";
          let targetProjectName: string = "Default Project";
          let projectCallbackUrl: string | null = null;
          let signingSecret: string | null = null;

          try {
            const assignments = await phoneRepo.getProjectAssignments();
            const assignment = assignments.get(receiverPhoneId);
            if (assignment?.projectId) {
              targetProjectId = assignment.projectId;
              targetProjectName = assignment.projectName || "WhatsApp Project";
              const proj = await projectRepo.findById(assignment.projectId);
              if (proj?.callbackUrl) {
                projectCallbackUrl = proj.callbackUrl;
                signingSecret = proj.webhookSigningSecret || null;
              }
            }
          } catch (projErr: any) {
            logger.warn("Project resolution error:", projErr.message);
          }

          // Fallback to dynamic request route if no project-level callback is mapped
          if (!projectCallbackUrl) {
            projectCallbackUrl =
              requestLogRepo.getDynamicRoute(senderPhone) ||
              requestLogRepo.getDynamicRoute(receiverPhoneId) ||
              null;
          }

          // Persist actual inbound message event into database
          try {
            await executeQuery(
              `INSERT INTO WA_MESSAGES (message_id, wamid, project_id, phone_number_id, customer_id, direction, message_type, content_text, status, retry_count, is_mock, created_at, updated_at)
               VALUES (@id, @wamid, @projId, @phoneId, @custId, 'inbound', @type, @content, 'delivered', 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME())`,
              {
                id: { type: sql.NVarChar(64), value: `in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}` },
                wamid: { type: sql.NVarChar(128), value: wamid },
                projId: { type: sql.NVarChar(64), value: targetProjectId },
                phoneId: { type: sql.NVarChar(64), value: receiverPhoneId },
                custId: { type: sql.NVarChar(64), value: `cust_${senderPhone.replace(/\D/g, "")}` },
                type: { type: sql.NVarChar(30), value: msg.type || "text" },
                content: { type: sql.NVarChar(sql.MAX), value: text },
              }
            );
          } catch (dbErr: any) {
            logger.warn("Failed to record inbound message to database:", dbErr.message);
          }

          // Redirect / forward inbound message to the respective project's webhook
          if (projectCallbackUrl) {
            forwardInboundMessageToProjectWebhook({
              targetUrl: projectCallbackUrl,
              senderPhone,
              receiverPhone: val.metadata?.display_phone_number || receiverPhoneId,
              receiverPhoneId,
              messageText: text,
              wamid,
              signingSecret,
              projectId: targetProjectId,
              projectName: targetProjectName,
              rawPayload: msg,
            }).catch((fwdErr: any) => {
              logger.error(`[Webhook] Forwarding to project webhook (${projectCallbackUrl}) failed:`, fwdErr.message);
            });
          }

          // Trigger Engine reply matching asynchronously
          triggerMatcher
            .processInboundReply({
              senderPhone,
              receiverPhoneId,
              messageText: text,
              wamid,
              timestamp,
            })
            .catch((err) => {
              logger.error("Reply trigger processing failed:", err);
            });

          // Workflow Engine matching & execution (drag-and-drop workflows)
          WorkflowTriggerMatcher.processIncoming({
            projectId: targetProjectId,
            phoneNumberId: receiverPhoneId,
            customerPhone: senderPhone,
            messageText: text,
            replyId: interactiveReplyId,
            wamid,
          }).catch((wfErr) => {
            logger.error("Workflow Engine execution error:", wfErr);
          });
        }

        // Process Outbound Status Updates (sent, delivered, read, failed)
        const statuses = val.statuses || [];
        for (const st of statuses) {
          const wamid = st.id;
          const status = st.status; // sent, delivered, read, failed
          if (!wamid || !status) continue;

          // console.log(`📊 Status Receipt: WAMID ${wamid} -> ${status}${st.errors ? ` (Errors: ${JSON.stringify(st.errors)})` : ""}`);

          let msgProjectId: string | null = null;
          try {
            const rows = await executeQuery<any>(
              `UPDATE WA_MESSAGES
               SET status = @status,
                   updated_at = SYSUTCDATETIME()
               OUTPUT inserted.project_id
               WHERE wamid = @wamid`,
              {
                wamid: { type: sql.NVarChar(128), value: wamid },
                status: { type: sql.NVarChar(30), value: status },
              }
            );
            if (rows && rows.length > 0) {
              msgProjectId = rows[0].project_id;
            }
          } catch (dbErr: any) {
            logger.warn("Failed to update status for wamid:", dbErr.message);
          }

          // Forward delivery receipt (sent, delivered, read, failed) to the respective project's webhook
          if (msgProjectId && msgProjectId !== "default" && msgProjectId !== "inbound") {
            try {
              const proj = await projectRepo.findById(msgProjectId);
              if (proj?.callbackUrl) {
                forwardStatusUpdateToProjectWebhook({
                  targetUrl: proj.callbackUrl,
                  wamid,
                  status,
                  recipientPhone: st.recipient_id ? `+${st.recipient_id.replace(/\D/g, "")}` : undefined,
                  signingSecret: proj.webhookSigningSecret,
                  projectId: proj.projectId,
                  projectName: proj.name,
                  errors: st.errors,
                  rawPayload: st,
                }).catch((fwdErr: any) => {
                  logger.warn(`[Webhook] Failed to forward status receipt to project ${proj.name}:`, fwdErr.message);
                });
              }
            } catch (err: any) {
              logger.warn("[Webhook] Project status receipt forwarding lookup error:", err.message);
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, meta: { correlationId, timestamp: new Date().toISOString() } });
  } catch (error: any) {
    logger.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Internal processing error" }, { status: 500 });
  }
}
