import axios from "axios";
import crypto from "crypto";
import { WebhookRepository } from "../repositories/webhookRepository";
import { getServerConfig } from "../config";
import { isSafeOutboundUrl } from "../security/webhookAllowlist";

export interface ForwardWebhookOptions {
  targetUrl: string;
  senderPhone: string;
  receiverPhone: string;
  receiverPhoneId?: string;
  messageText: string;
  wamid?: string;
  signingSecret?: string | null;
  projectId?: string;
  projectName?: string;
  rawPayload?: any;
}

export interface ForwardStatusOptions {
  targetUrl: string;
  wamid: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  recipientPhone?: string;
  signingSecret?: string | null;
  projectId?: string;
  projectName?: string;
  errors?: any[];
  rawPayload?: any;
}

async function dispatchWebhookPayload(params: {
  targetUrl: string;
  eventType: string;
  deliveryId: string;
  eventId: string;
  payload: Record<string, any>;
  signingSecret?: string | null;
  projectId?: string;
  projectName?: string;
}) {
  const webhookRepo = new WebhookRepository();
  const config = getServerConfig();
  const secret = params.signingSecret || config.WEBHOOK_SIGNING_SECRET;
  const rawBody = JSON.stringify(params.payload);
  const signature = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  let status: "delivered" | "failed" | "pending" = "pending";
  let httpStatusCode = 0;
  let responseBody: any = null;

  const urlCheck = isSafeOutboundUrl(params.targetUrl);
  if (!urlCheck.safe) {
    status = "failed";
    httpStatusCode = 403;
    responseBody = { error: "SSRF_BLOCKED", reason: urlCheck.reason };
  } else {
    try {
      const res = await axios.post(params.targetUrl, params.payload, {
        headers: {
          "Content-Type": "application/json",
          "X-Engine-Event": params.eventType,
          "X-Engine-Delivery": params.deliveryId,
          "X-Hub-Signature-256": signature,
        },
        timeout: 5000,
        maxRedirects: 0,
      });
      httpStatusCode = res.status;
      status = res.status >= 200 && res.status < 300 ? "delivered" : "failed";
      responseBody = typeof res.data === "object" ? res.data : { raw: String(res.data) };
    } catch (err: any) {
      status = "failed";
      if (err.response) {
        httpStatusCode = err.response.status;
        responseBody = err.response.data;
      } else {
        httpStatusCode = err.code === "ECONNABORTED" ? 504 : 502;
        responseBody = {
          error: err.message || "Webhook delivery failed",
          code: err.code || "NETWORK_ERROR",
        };
      }
    }
  }

  await webhookRepo.saveDelivery({
    deliveryId: params.deliveryId,
    projectId: params.projectId || "dynamic",
    projectName: params.projectName || "Dynamic Route",
    eventType: params.eventType,
    sourceEventId: params.eventId,
    targetUrl: params.targetUrl,
    payload: params.payload,
    status,
    httpStatusCode,
    responseBody,
    attemptCount: 1,
    createdAt: new Date().toISOString(),
    deliveredAt: status === "delivered" ? new Date().toISOString() : undefined,
  });

  return {
    deliveryId: params.deliveryId,
    status,
    httpStatusCode,
    targetUrl: params.targetUrl,
    redirectPayload: params.payload,
    responseBody,
  };
}

export async function forwardInboundMessageToProjectWebhook(opts: ForwardWebhookOptions) {
  const deliveryId = `del_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const eventId = `ev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const redirectPayload = {
    event: "message.received",
    deliveryId,
    timestamp: new Date().toISOString(),
    source: "user_reply",
    receiver: {
      phoneNumber: opts.receiverPhone,
      phoneNumberId: opts.receiverPhoneId,
    },
    sender: {
      phoneNumber: opts.senderPhone,
    },
    message: {
      id: opts.wamid || `wamid.HBg_${Date.now()}`,
      type: "text",
      text: opts.messageText,
      timestamp: new Date().toISOString(),
    },
    project: {
      projectId: opts.projectId || "dynamic",
      name: opts.projectName || "Dynamic Route",
    },
    raw: opts.rawPayload || null,
  };

  return dispatchWebhookPayload({
    targetUrl: opts.targetUrl,
    eventType: "message.received",
    deliveryId,
    eventId,
    payload: redirectPayload,
    signingSecret: opts.signingSecret,
    projectId: opts.projectId,
    projectName: opts.projectName,
  });
}

export async function forwardStatusUpdateToProjectWebhook(opts: ForwardStatusOptions) {
  const deliveryId = `del_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const eventId = `ev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const redirectPayload = {
    event: `message.${opts.status}`,
    deliveryId,
    timestamp: new Date().toISOString(),
    source: "meta_status_receipt",
    message: {
      id: opts.wamid,
      status: opts.status,
      recipientPhone: opts.recipientPhone,
      errors: opts.errors || null,
      timestamp: new Date().toISOString(),
    },
    project: {
      projectId: opts.projectId || "dynamic",
      name: opts.projectName || "Dynamic Route",
    },
    raw: opts.rawPayload || null,
  };

  return dispatchWebhookPayload({
    targetUrl: opts.targetUrl,
    eventType: `message.${opts.status}`,
    deliveryId,
    eventId,
    payload: redirectPayload,
    signingSecret: opts.signingSecret,
    projectId: opts.projectId,
    projectName: opts.projectName,
  });
}
