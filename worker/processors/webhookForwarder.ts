import { Job } from "bullmq";
import axios from "axios";
import crypto from "crypto";

export async function processWebhookForwarding(job: Job): Promise<any> {
  const { deliveryId, targetUrl, payload, eventType } = job.data;
  console.log(`[Worker:WebhookForwarder] Forwarding event ${eventType} (delivery: ${deliveryId}) -> ${targetUrl}`);

  const secret = process.env.WEBHOOK_SIGNING_SECRET || "default_signing_secret";
  const rawBody = JSON.stringify(payload);
  const signature = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  try {
    const response = await axios.post(targetUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Engine-Event": eventType,
        "X-Engine-Delivery": deliveryId,
        "X-Hub-Signature-256": signature,
      },
      timeout: 10000,
    });

    console.log(`[Worker:WebhookForwarder] Callback delivered with HTTP ${response.status}`);
    return { success: true, statusCode: response.status, body: response.data };
  } catch (error: any) {
    console.error(`[Worker:WebhookForwarder] Failed to deliver callback:`, error.message);
    throw error; // Triggers BullMQ exponential retry
  }
}
