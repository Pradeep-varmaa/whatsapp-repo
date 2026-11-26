/**
 * Script: Print All Meta Webhook Data
 *
 * Usage:
 *   npx tsx scripts/print-webhooks.ts
 *   or: npm run print:webhooks
 */

import { executeQuery } from "../src/server/database/connection";
import { WebhookRepository } from "../src/server/repositories/webhookRepository";

async function main() {
  console.log("================================================================================");
  console.log("📦 META WHATSAPP WEBHOOK DATA VIEWER");
  console.log("================================================================================\n");

  const repo = new WebhookRepository();
  let events = await repo.findAllEvents();

  // If local repo is empty, try querying the running server endpoint
  if (!events || events.length === 0) {
    try {
      const res = await fetch("http://localhost:3000/api/v1/webhooks?type=events");
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          events = json.data;
        }
      }
    } catch {
      // Server not running on 3000, ignore
    }
  }

  // Also query MSSQL WA_WEBHOOK_EVENTS if available
  if (!events || events.length === 0) {
    try {
      const rows = await executeQuery<any>(
        `SELECT TOP 100 event_id, meta_event_id, event_type, phone_number_id, waba_id, payload_json, processing_status, received_at
         FROM WA_WEBHOOK_EVENTS
         ORDER BY received_at DESC`
      );
      if (rows && rows.length > 0) {
        events = rows.map((r) => ({
          eventId: r.event_id,
          metaEventId: r.meta_event_id,
          eventType: r.event_type,
          phoneNumberId: r.phone_number_id,
          wabaId: r.waba_id,
          payload: typeof r.payload_json === "string" ? JSON.parse(r.payload_json) : r.payload_json,
          processingStatus: r.processing_status,
          receivedAt: new Date(r.received_at).toISOString(),
        }));
      }
    } catch {
      // Database not reachable, ignore
    }
  }

  if (!events || events.length === 0) {
    console.log("ℹ️  No webhook events have been recorded yet.\n");
    console.log("To receive live events from Meta:");
    console.log("  1. Ensure your server is running (npm run dev)");
    console.log("  2. Point your Meta Developer Webhook callback URL to:");
    console.log("     https://<YOUR_TUNNEL_OR_DOMAIN>/webhooks/whatsapp/meta");
    console.log("  3. Subscribe to the 'messages' field in Meta Developer Console.");
    console.log("  4. Send a message to your WhatsApp number from a phone.\n");
    console.log("Whenever Meta sends a webhook, the complete payload will be:");
    console.log("  • Printed live in the 'npm run dev' terminal console.");
    console.log("  • Recorded in the Dashboard under the 'Webhooks' tab (/webhooks).");
    console.log("  • Printable anytime via: npm run print:webhooks\n");
    process.exit(0);
  }

  console.log(`✅ Found ${events.length} received Meta webhook event(s):\n`);

  events.forEach((ev, idx) => {
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`[Event #${idx + 1}] ID: ${ev.eventId}`);
    console.log(`⏰ Received At: ${ev.receivedAt}`);
    console.log(`🏷️  Event Type:  ${ev.eventType}`);
    if (ev.phoneNumberId) console.log(`📱 Phone ID:    ${ev.phoneNumberId}`);
    if (ev.wabaId) console.log(`🏢 WABA ID:     ${ev.wabaId}`);
    console.log(`⚙️  Status:      ${ev.processingStatus}`);
    console.log("\n📦 Payload JSON:");
    console.log(JSON.stringify(ev.payload, null, 2));
    console.log(`--------------------------------------------------------------------------------\n`);
  });

  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Error printing webhooks:", err.message);
  process.exit(1);
});
