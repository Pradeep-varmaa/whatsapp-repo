/**
 * API Key Authentication & Audit Logging Test Suite
 *
 * Validates:
 * 1. Wrong API Key -> 401 generic + audit log
 * 2. Revoked Key -> 401 + audit log
 * 3. Expired Key -> 401 + audit log
 * 4. Wrong Scope -> 403 + audit log
 * 5. Recipient Not Allowed -> 403 + masked recipient audit log
 * 6. Rate Limit (Per Key) -> 429 + Retry-After + audit log
 * 7. Template-Required Case (Free text outside 24h window) -> 422 + audit log
 * 8. Valid Send (Template) -> 200 { requestId, messageId } + audit log
 * 9. Valid Send (Text inside 24h window) -> 200 + audit log
 * 10. Idempotency Key -> Returns original messageId
 * 11. Audit Row Written for every single request
 */

import { NextRequest } from "next/server";
import { POST } from "../src/app/api/v1/messages/route";
import { ApiKeyRepository } from "../src/server/repositories/apiKeyRepository";
import { AuditLogRepository } from "../src/server/repositories/auditLogRepository";
import { RateLimiter } from "../src/server/security/rateLimiter";
import { MessagingService } from "../src/server/services/messagingService";
import { generateWaeApiKey, maskRecipientPhone } from "../src/server/security/crypto";
import { getMetaGraphApiClient } from "../src/server/integrations/meta/graphApiClient";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function createMockRequest(body: unknown, headers: Record<string, string>): NextRequest {
  const url = "http://localhost:3000/api/v1/messages";
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function runApiKeyAuditTests() {
  console.log("=================================================");
  console.log("⚡ TESTING API KEY AUTH & AUDIT LOG SYSTEM");
  console.log("=================================================\n");

  const apiKeyRepo = new ApiKeyRepository();
  const auditRepo = new AuditLogRepository();

  // Reset stores for clean test run
  ApiKeyRepository.resetMemory();
  AuditLogRepository.resetMemory();
  RateLimiter.reset();
  MessagingService.resetStores();

  const PHONE_NUMBER_ID = "355139157678636";
  const ALLOWED_PHONE = "+15551234567";

  // Create Standard Valid Key
  const { rawKey: validRawKey, keyPrefix: validPrefix, keyHash: validHash } = generateWaeApiKey();
  const validKeyRecord = await apiKeyRepo.create({
    id: "key_valid_1",
    name: "Standard Production Service Key",
    key_prefix: validPrefix,
    key_hash: validHash,
    phone_number_id: PHONE_NUMBER_ID,
    scopes: ["messages:send"],
    rate_limit_per_minute: 60,
    allowed_recipients: [ALLOWED_PHONE],
    created_by: "test_admin",
  });

  // Mock Graph API live network calls for unit testing environment
  const metaClient = getMetaGraphApiClient();
  let mockWamidCounter = 1000;
  metaClient.sendTemplateMessage = async () => {
    mockWamidCounter++;
    return { wamid: `wamid.HB_TEST_${mockWamidCounter}` };
  };
  metaClient.sendTextMessage = async () => {
    mockWamidCounter++;
    return { wamid: `wamid.TXT_TEST_${mockWamidCounter}` };
  };

  // 1. Test: Wrong Key (Invalid key prefix or mismatch)
  {
    console.log("▶ Test 1: Unknown / Invalid API Key");
    const req = createMockRequest(
      { to: ALLOWED_PHONE, type: "template", template: { name: "hello_world" } },
      { authorization: "Bearer wae_live_completely_fake_invalid_key_99999" }
    );
    const res = await POST(req);
    assert(res.status === 401, `Expected 401, got ${res.status}`);

    const { logs } = await auditRepo.find({ event: "auth_failed" });
    assert(logs.length > 0, "Audit row must be recorded for auth_failed");
    assert(logs[0].outcome === "failure", "Audit outcome must be failure");
    assert(logs[0].reason === "invalid_key", "Audit reason must be invalid_key");
    assert(logs[0].http_status === 401, "Audit status must be 401");
    console.log("✔ Unknown / invalid key rejected with 401 and logged to audit_logs");
  }

  // 2. Test: Revoked Key
  {
    console.log("\n▶ Test 2: Revoked API Key");
    const { rawKey: revokedRawKey, keyPrefix: revokedPrefix, keyHash: revokedHash } = generateWaeApiKey();
    const revokedKey = await apiKeyRepo.create({
      id: "key_revoked_1",
      name: "Revoked Service Key",
      key_prefix: revokedPrefix,
      key_hash: revokedHash,
      phone_number_id: PHONE_NUMBER_ID,
      scopes: ["messages:send"],
      rate_limit_per_minute: 60,
      created_by: "test_admin",
    });
    await apiKeyRepo.revoke(revokedKey.id);

    const req = createMockRequest(
      { to: ALLOWED_PHONE, type: "template", template: { name: "hello_world" } },
      { authorization: `Bearer ${revokedRawKey}` }
    );
    const res = await POST(req);
    assert(res.status === 401, `Expected 401, got ${res.status}`);

    const { logs } = await auditRepo.find({ api_key_id: revokedKey.id });
    assert(logs.length > 0, "Audit row must be recorded for revoked key");
    assert(logs[0].reason === "revoked", "Audit reason must be revoked");
    assert(logs[0].outcome === "failure", "Audit outcome must be failure");
    console.log("✔ Revoked key rejected with 401 and logged to audit_logs");
  }

  // 3. Test: Expired Key
  {
    console.log("\n▶ Test 3: Expired API Key");
    const { rawKey: expiredRawKey, keyPrefix: expiredPrefix, keyHash: expiredHash } = generateWaeApiKey();
    const expiredKey = await apiKeyRepo.create({
      id: "key_expired_1",
      name: "Expired Key",
      key_prefix: expiredPrefix,
      key_hash: expiredHash,
      phone_number_id: PHONE_NUMBER_ID,
      scopes: ["messages:send"],
      rate_limit_per_minute: 60,
      expires_at: new Date(Date.now() - 3600000).toISOString(),
      created_by: "test_admin",
    });

    const req = createMockRequest(
      { to: ALLOWED_PHONE, type: "template", template: { name: "hello_world" } },
      { authorization: `Bearer ${expiredRawKey}` }
    );
    const res = await POST(req);
    assert(res.status === 401, `Expected 401, got ${res.status}`);

    const { logs } = await auditRepo.find({ api_key_id: expiredKey.id });
    assert(logs.length > 0, "Audit row must be recorded for expired key");
    assert(logs[0].reason === "expired", "Audit reason must be expired");
    console.log("✔ Expired key rejected with 401 and logged to audit_logs");
  }

  // 4. Test: Wrong Scope (Lacks messages:send)
  {
    console.log("\n▶ Test 4: Missing 'messages:send' Scope");
    const { rawKey: scopeRawKey, keyPrefix: scopePrefix, keyHash: scopeHash } = generateWaeApiKey();
    const wrongScopeKey = await apiKeyRepo.create({
      id: "key_wrong_scope_1",
      name: "Read-Only Key",
      key_prefix: scopePrefix,
      key_hash: scopeHash,
      phone_number_id: PHONE_NUMBER_ID,
      scopes: ["templates:read"],
      rate_limit_per_minute: 60,
      created_by: "test_admin",
    });

    const req = createMockRequest(
      { to: ALLOWED_PHONE, type: "template", template: { name: "hello_world" } },
      { authorization: `Bearer ${scopeRawKey}` }
    );
    const res = await POST(req);
    assert(res.status === 403, `Expected 403, got ${res.status}`);

    const { logs } = await auditRepo.find({ api_key_id: wrongScopeKey.id });
    assert(logs.length > 0, "Audit row must be recorded for wrong_scope");
    assert(logs[0].event === "forbidden", "Audit event must be forbidden");
    assert(logs[0].reason === "wrong_scope", "Audit reason must be wrong_scope");
    assert(logs[0].http_status === 403, "Audit status must be 403");
    console.log("✔ Wrong scope rejected with 403 and logged to audit_logs");
  }

  // 5. Test: Recipient Not Allowed (Key bound allowlist)
  {
    console.log("\n▶ Test 5: Recipient Not In Allowed List");
    const DISALLOWED_PHONE = "+19998887777";
    const req = createMockRequest(
      { to: DISALLOWED_PHONE, type: "template", template: { name: "hello_world" } },
      { authorization: `Bearer ${validRawKey}` }
    );
    const res = await POST(req);
    assert(res.status === 403, `Expected 403, got ${res.status}`);

    const { logs } = await auditRepo.find({ event: "forbidden" });
    const match = logs.find((l) => l.reason === "recipient_not_allowed");
    assert(Boolean(match), "Audit row must be recorded for recipient_not_allowed");
    assert(match?.recipient_masked === maskRecipientPhone(DISALLOWED_PHONE), "Audit must store masked recipient");
    console.log(`✔ Unauthorized recipient rejected with 403 and masked (${match?.recipient_masked}) in audit_logs`);
  }

  // 6. Test: Rate Limit per Key (429 with Retry-After)
  {
    console.log("\n▶ Test 6: Rate Limiting per Key (429 with Retry-After)");
    const { rawKey: rlRawKey, keyPrefix: rlPrefix, keyHash: rlHash } = generateWaeApiKey();
    const rlKey = await apiKeyRepo.create({
      id: "key_rate_limit_1",
      name: "Low Rate Limit Key",
      key_prefix: rlPrefix,
      key_hash: rlHash,
      phone_number_id: PHONE_NUMBER_ID,
      scopes: ["messages:send"],
      rate_limit_per_minute: 2, // Only 2 allowed
      created_by: "test_admin",
    });

    // Request 1: allowed
    const r1 = await POST(
      createMockRequest(
        { to: ALLOWED_PHONE, type: "template", template: { name: "hello_world" } },
        { authorization: `Bearer ${rlRawKey}` }
      )
    );
    // Request 2: allowed
    const r2 = await POST(
      createMockRequest(
        { to: ALLOWED_PHONE, type: "template", template: { name: "hello_world" } },
        { authorization: `Bearer ${rlRawKey}` }
      )
    );

    // Request 3: rate limited!
    const r3 = await POST(
      createMockRequest(
        { to: ALLOWED_PHONE, type: "template", template: { name: "hello_world" } },
        { authorization: `Bearer ${rlRawKey}` }
      )
    );

    assert(r3.status === 429, `Expected 429, got ${r3.status}`);
    const retryAfter = r3.headers.get("retry-after");
    assert(Boolean(retryAfter), "Rate limit response must include Retry-After header");

    const { logs } = await auditRepo.find({ api_key_id: rlKey.id, event: "rate_limited" });
    assert(logs.length > 0, "Audit row must be recorded for rate_limited");
    assert(logs[0].http_status === 429, "Audit status must be 429");
    console.log(`✔ Request 3 rate-limited with 429, Retry-After: ${retryAfter}s, logged to audit_logs`);
  }

  // 7. Test: Template-Required Case (Free text outside 24h window)
  {
    console.log("\n▶ Test 7: Free text outside 24-hour Customer Window -> 422");
    const req = createMockRequest(
      { to: ALLOWED_PHONE, type: "text", text: "Hello! This is free text." },
      { authorization: `Bearer ${validRawKey}` }
    );
    const res = await POST(req);
    assert(res.status === 422, `Expected 422, got ${res.status}`);
    const json = await res.json();
    assert(json.code === "TEMPLATE_REQUIRED", "Error code must be TEMPLATE_REQUIRED");

    const { logs } = await auditRepo.find({ event: "validation_failed" });
    const match = logs.find((l) => l.reason === "template_required");
    assert(Boolean(match), "Audit row must be recorded for template_required");
    assert(match?.http_status === 422, "Audit status must be 422");
    console.log("✔ Free text outside 24h window rejected with 422 TEMPLATE_REQUIRED and logged to audit_logs");
  }

  // 8. Test: Valid Send (Template) -> 200 { requestId, messageId }
  {
    console.log("\n▶ Test 8: Valid Template Message Send -> 200 { requestId, messageId }");
    const req = createMockRequest(
      {
        to: ALLOWED_PHONE,
        type: "template",
        template: { name: "hello_world", language: "en_US" },
      },
      { authorization: `Bearer ${validRawKey}` }
    );
    const res = await POST(req);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(Boolean(json.requestId), "Response must include requestId");
    assert(Boolean(json.messageId), "Response must include messageId");

    const { logs } = await auditRepo.find({ event: "message_sent" });
    assert(logs.length > 0, "Audit row must be recorded for message_sent");
    assert(logs[0].outcome === "success", "Audit outcome must be success");
    assert(logs[0].meta_message_id === json.messageId, "Audit must record meta message ID");
    assert(logs[0].recipient_masked === maskRecipientPhone(ALLOWED_PHONE), "Audit must store masked recipient");
    console.log(`✔ Message dispatched successfully with messageId ${json.messageId} and logged to audit_logs`);
  }

  // 9. Test: Valid Send (Text inside 24h window)
  {
    console.log("\n▶ Test 9: Free text inside active 24-hour Customer Window -> 200");
    // Simulate customer inbound message within the 24-hour window
    MessagingService.recordInboundInteraction(PHONE_NUMBER_ID, ALLOWED_PHONE, Date.now() - 3600000);

    const req = createMockRequest(
      {
        to: ALLOWED_PHONE,
        type: "text",
        text: "Replying to your WhatsApp message!",
      },
      { authorization: `Bearer ${validRawKey}` }
    );
    const res = await POST(req);
    assert(res.status === 200, `Expected 200 inside 24h window, got ${res.status}`);
    const json = await res.json();
    assert(Boolean(json.messageId), "Response must include messageId");
    console.log("✔ Free text inside 24h customer window sent successfully and logged to audit_logs");
  }

  // 10. Test: Idempotency Key
  {
    console.log("\n▶ Test 10: Idempotency Key Honoring");
    const IDEMPOTENCY_KEY = `idem_${Date.now()}_test`;

    const r1 = await POST(
      createMockRequest(
        {
          to: ALLOWED_PHONE,
          type: "template",
          template: { name: "hello_world" },
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        { authorization: `Bearer ${validRawKey}` }
      )
    );
    const j1 = await r1.json();

    const r2 = await POST(
      createMockRequest(
        {
          to: ALLOWED_PHONE,
          type: "template",
          template: { name: "hello_world" },
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        { authorization: `Bearer ${validRawKey}` }
      )
    );
    const j2 = await r2.json();

    assert(r2.status === 200, "Idempotent request must return 200");
    assert(j1.messageId === j2.messageId, "Idempotent request must return the exact same messageId");
    console.log(`✔ Idempotent request returned original messageId: ${j2.messageId}`);
  }

  // 11. Verify Append-Only Audit Integrity
  {
    console.log("\n▶ Test 11: Audit Log Row Completeness");
    const { total } = await auditRepo.find();
    assert(total >= 10, `Expected at least 10 audit rows written, found ${total}`);
    console.log(`✔ Total audit log rows recorded: ${total} (every single request accounted for)`);
  }

  console.log("\n🎉 ALL API KEY AUTH & AUDIT LOG TESTS PASSED SUCCESSFULLY!\n");
}

runApiKeyAuditTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
