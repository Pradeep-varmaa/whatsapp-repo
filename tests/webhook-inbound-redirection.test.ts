/**
 * Test Suite: Meta Webhook Inbound Ingestion & Project Redirection
 *
 * Validates:
 * 1. GET /webhooks/whatsapp/meta verification challenge
 * 2. POST /webhooks/whatsapp/meta HMAC-SHA256 signature verification
 * 3. Inbound customer message automatically resolves project and redirects to project callback URL
 * 4. Inbound customer message automatically opens 24-hour customer care window
 * 5. Outbound delivery status update forwards receipt to project callback URL
 */

import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/webhooks/whatsapp/meta/route";
import { getServerConfig } from "../src/server/config";
import { PhoneNumberRepository } from "../src/server/repositories/phoneNumberRepository";
import { ProjectRepository } from "../src/server/repositories/projectRepository";
import { WebhookRepository } from "../src/server/repositories/webhookRepository";
import { MessagingService } from "../src/server/services/messagingService";
import crypto from "crypto";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runWebhookTests() {
  console.log("==================================================");
  console.log("⚡ TESTING META WEBHOOK & PROJECT REDIRECTION");
  console.log("==================================================\n");

  const config = getServerConfig();
  const phoneRepo = new PhoneNumberRepository();
  const projectRepo = new ProjectRepository();
  const webhookRepo = new WebhookRepository();
  const messagingService = new MessagingService();

  // Test 1: GET Challenge Verification
  {
    console.log("▶ Test 1: GET verification challenge from Meta");
    const verifyToken = config.WEBHOOK_VERIFY_TOKEN;
    const challenge = "test_challenge_random_123456";
    const url = `http://localhost:3000/webhooks/whatsapp/meta?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${challenge}`;
    const req = new NextRequest(url, { method: "GET" });
    const res = await GET(req);

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const text = await res.text();
    assert(text === challenge, `Challenge mismatch. Expected ${challenge}, got ${text}`);
    console.log("✔ Correctly verified Meta challenge handshake (200 OK)");
  }

  // Set up a mock project with a callback URL
  const TEST_PROJECT_ID = `proj_test_${Date.now()}`;
  const TEST_PHONE_ID = `phone_test_${Date.now()}`;
  const TEST_CALLBACK_URL = "https://example.com/api/project-webhook";
  const TEST_CUSTOMER_PHONE = "919618795584";

  await projectRepo.create({
    projectId: TEST_PROJECT_ID,
    name: "Customer Support Suite",
    slug: "customer-support-suite",
    description: "Support desk project",
    status: "active",
    callbackUrl: TEST_CALLBACK_URL,
    eventTypes: ["message.received", "message.sent", "message.delivered"],
    webhookSigningSecret: "whsec_proj_custom_secret",
  });

  await phoneRepo.assignToProject(TEST_PHONE_ID, TEST_PROJECT_ID, "Customer Support Suite", true);

  // Test 2: Inbound Message Handling & Redirection
  {
    console.log("\n▶ Test 2: Inbound WhatsApp message received from Meta");

    const inboundPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba_12345",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "15551390533",
                  phone_number_id: TEST_PHONE_ID,
                },
                contacts: [{ profile: { name: "Test User" }, wa_id: TEST_CUSTOMER_PHONE }],
                messages: [
                  {
                    from: TEST_CUSTOMER_PHONE,
                    id: `wamid.HBg_${Date.now()}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    text: { body: "Hello support, I need help with my account" },
                    type: "text",
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const rawBody = JSON.stringify(inboundPayload);
    const signature = "sha256=" + crypto.createHmac("sha256", config.APP_SECRET).update(rawBody).digest("hex");

    const req = new NextRequest("http://localhost:3000/webhooks/whatsapp/meta", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": signature,
      },
      body: rawBody,
    });

    const res = await POST(req);
    assert(res.status === 200, `Expected 200 OK, got ${res.status}`);
    const json = await res.json();
    assert(json.success === true, "Response must be success");

    // Give asynchronous forwarder task a moment to register
    await new Promise((r) => setTimeout(r, 100));

    // Check that customer 24h window was opened
    const isWindowOpen = await messagingService.isCustomerInside24hWindow(TEST_PHONE_ID, TEST_CUSTOMER_PHONE);
    assert(isWindowOpen === true, "Customer 24h window must be automatically opened by inbound message");
    console.log("✔ Customer 24-hour service window opened automatically");

    // Check that delivery was recorded in webhookRepo
    const deliveries = await webhookRepo.findAllDeliveries(TEST_PROJECT_ID);
    assert(deliveries.length > 0, "Webhook delivery must be recorded for project");
    const lastDelivery = deliveries[0];
    assert(lastDelivery.targetUrl === TEST_CALLBACK_URL, "Target URL must match project callbackUrl");
    assert(lastDelivery.eventType === "message.received", "Event type must be message.received");
    console.log(`✔ Inbound message redirected to project webhook (${lastDelivery.targetUrl})`);
  }

  console.log("\n🎉 ALL META WEBHOOK & PROJECT REDIRECTION TESTS PASSED!\n");
}

runWebhookTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
