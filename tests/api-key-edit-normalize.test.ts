/**
 * Test Suite: API Key Edit Action, E.164 Normalization & Audit Logging
 *
 * Validates:
 * 1. normalizePhoneE164() correctly handles "+91 90146 83627", "919014683627", and "+919014683627"
 * 2. PATCH /api/api-keys/{id} updates name, allowed_recipients, rate_limit_per_minute, and expires_at
 * 3. PATCH /api/api-keys/{id} never alters key secret, hash, or prefix
 * 4. Audit row recorded for key_updated with changed field names only (no values)
 * 5. POST /api/v1/messages allows matching across all variations of formatted phone numbers
 * 6. Disallowed recipient returns generic 403 response, writes audit log with reason "recipient_not_allowed" and masked recipient
 */

import { NextRequest } from "next/server";
import { PATCH } from "../src/app/api/api-keys/[id]/route";
import { POST as POST_MESSAGES } from "../src/app/api/v1/messages/route";
import { ApiKeyRepository } from "../src/server/repositories/apiKeyRepository";
import { AuditLogRepository } from "../src/server/repositories/auditLogRepository";
import { RateLimiter } from "../src/server/security/rateLimiter";
import { MessagingService } from "../src/server/services/messagingService";
import { generateWaeApiKey, maskRecipientPhone } from "../src/server/security/crypto";
import { normalizePhoneE164, isValidE164 } from "../src/shared/utils/phone";
import { getMetaGraphApiClient } from "../src/server/integrations/meta/graphApiClient";
import { signJwt } from "../src/server/security/crypto";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function createJsonRequest(
  url: string,
  method: string,
  body: unknown,
  token?: string
): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return new NextRequest(url, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

async function runTests() {
  console.log("=============================================================");
  console.log("⚡ TESTING API KEY EDIT, E.164 NORMALIZATION & AUDIT SYSTEM");
  console.log("=============================================================\n");

  const apiKeyRepo = new ApiKeyRepository();
  const auditRepo = new AuditLogRepository();

  ApiKeyRepository.resetMemory();
  AuditLogRepository.resetMemory();
  RateLimiter.reset();
  MessagingService.resetStores();

  // Mock Graph API live network calls
  const metaClient = getMetaGraphApiClient();
  let mockWamidCounter = 2000;
  metaClient.sendTemplateMessage = async () => {
    mockWamidCounter++;
    return { wamid: `wamid.EDIT_TEST_${mockWamidCounter}` };
  };

  // Generate Admin JWT token for API key management
  const adminToken = signJwt({
    userId: "usr_admin_001",
    email: "admin@company.com",
    role: "admin",
  });

  const userToken = signJwt({
    userId: "usr_regular_001",
    email: "user@company.com",
    role: "user",
  });

  // -------------------------------------------------------------
  // Test 1: Phone number normalization to E.164
  // -------------------------------------------------------------
  {
    console.log("▶ Test 1: Phone number E.164 normalization");
    const v1 = normalizePhoneE164("+91 90146 83627");
    const v2 = normalizePhoneE164("919014683627");
    const v3 = normalizePhoneE164("+919014683627");
    const v4 = normalizePhoneE164("+91-90146-83627");

    assert(v1 === "+919014683627", `Expected +919014683627, got ${v1}`);
    assert(v2 === "+919014683627", `Expected +919014683627, got ${v2}`);
    assert(v3 === "+919014683627", `Expected +919014683627, got ${v3}`);
    assert(v4 === "+919014683627", `Expected +919014683627, got ${v4}`);
    assert(isValidE164(v1), "Should be valid E.164");

    console.log("✔ All variants (+91 90146 83627, 919014683627, +919014683627) normalized to +919014683627");
  }

  // -------------------------------------------------------------
  // Test 2: Create initial key
  // -------------------------------------------------------------
  const { rawKey, keyPrefix, keyHash } = generateWaeApiKey();
  const PHONE_NUMBER_ID = "355139157678636";
  const initialKey = await apiKeyRepo.create({
    id: "key_edit_target_1",
    name: "Initial Service Key",
    key_prefix: keyPrefix,
    key_hash: keyHash,
    phone_number_id: PHONE_NUMBER_ID,
    scopes: ["messages:send"],
    rate_limit_per_minute: 60,
    allowed_recipients: ["+15551234567"],
    created_by: "usr_admin_001",
    raw_key: rawKey,
  });

  // -------------------------------------------------------------
  // Test 3: Unauthorized / non-admin cannot PATCH /api/api-keys/{id}
  // -------------------------------------------------------------
  {
    console.log("\n▶ Test 3: Non-admin rejected from editing API key");
    const req = createJsonRequest(
      `http://localhost:3000/api/api-keys/${initialKey.id}`,
      "PATCH",
      { name: "Hacked Name" },
      userToken
    );
    const res = await PATCH(req, { params: Promise.resolve({ id: initialKey.id }) });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
    console.log("✔ Non-admin role correctly rejected with 403 Forbidden");
  }

  // -------------------------------------------------------------
  // Test 4: Admin successfully updates name, allowed_recipients, rate_limit, and expiry
  // -------------------------------------------------------------
  {
    console.log("\n▶ Test 4: Admin PATCH updates key and validates fields");
    const updateBody = {
      name: "Updated Production Dispatcher",
      rateLimitPerMinute: 120,
      allowedRecipients: ["+91 90146 83627", "+15559876543"], // Will be normalized
      expiresAt: "2027-01-01T00:00:00.000Z",
      // Attempt to tamper with protected fields:
      key_hash: "malicious_fake_hash",
      rawKey: "wae_live_fake_key",
    };

    const req = createJsonRequest(
      `http://localhost:3000/api/api-keys/${initialKey.id}`,
      "PATCH",
      updateBody,
      adminToken
    );

    const res = await PATCH(req, { params: Promise.resolve({ id: initialKey.id }) });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.success === true, "Response success must be true");
    assert(json.data.name === "Updated Production Dispatcher", "Name must be updated");
    assert(json.data.rateLimitPerMinute === 120, "Rate limit must be updated to 120");
    assert(json.data.allowedRecipients.includes("+919014683627"), "Allowed recipients must include normalized +919014683627");
    assert(json.data.allowedRecipients.includes("+15559876543"), "Allowed recipients must include normalized +15559876543");

    // Verify key_hash and raw_key were NOT changed in repo
    const persisted = await apiKeyRepo.findById(initialKey.id);
    assert(persisted?.key_hash === keyHash, "key_hash must remain unchanged!");
    assert(persisted?.key_prefix === keyPrefix, "key_prefix must remain unchanged!");

    console.log("✔ PATCH updated permitted fields; protected secret/hash remained untouched");
  }

  // -------------------------------------------------------------
  // Test 5: Verify key_updated audit row contains CHANGED FIELD NAMES ONLY (no values)
  // -------------------------------------------------------------
  {
    console.log("\n▶ Test 5: key_updated audit row check");
    const { logs } = await auditRepo.find({ event: "key_updated", api_key_id: initialKey.id });
    assert(logs.length > 0, "Audit log row must exist for key_updated");
    const auditRow = logs[0];
    assert(auditRow.outcome === "success", "Outcome must be success");
    assert(auditRow.reason === "key_updated", "Reason must be key_updated");
    assert(Boolean(auditRow.error_summary), "Summary must describe changed fields");

    // Verify changed field names are present
    assert(auditRow.error_summary!.includes("name"), "Summary must include 'name'");
    assert(auditRow.error_summary!.includes("allowed_recipients"), "Summary must include 'allowed_recipients'");
    assert(auditRow.error_summary!.includes("rate_limit_per_minute"), "Summary must include 'rate_limit_per_minute'");
    assert(auditRow.error_summary!.includes("expires_at"), "Summary must include 'expires_at'");

    // Crucial: verify no values or secrets leaked into the audit row
    assert(!auditRow.error_summary!.includes("90146"), "Audit summary must NOT leak phone numbers/values!");
    assert(!auditRow.error_summary!.includes("malicious"), "Audit summary must NOT leak payload values!");
    assert(!auditRow.error_summary!.includes("Updated Production"), "Audit summary must NOT leak new name!");

    console.log(`✔ Audit row verified: event=${auditRow.event}, summary="${auditRow.error_summary}"`);
  }

  // -------------------------------------------------------------
  // Test 6: POST /api/v1/messages matches normalized recipient variants
  // -------------------------------------------------------------
  {
    console.log("\n▶ Test 6: Messaging endpoint recipient normalization matching");

    // 6a: Send with unformatted '919014683627' (should match '+919014683627')
    const req1 = createJsonRequest(
      "http://localhost:3000/api/v1/messages",
      "POST",
      { to: "919014683627", type: "template", template: { name: "order_confirmation" } },
      rawKey
    );
    const res1 = await POST_MESSAGES(req1);
    assert(res1.status === 200, `Expected 200 for '919014683627', got ${res1.status}`);

    // 6b: Send with spaced '+91 90146 83627' (should match '+919014683627')
    const req2 = createJsonRequest(
      "http://localhost:3000/api/v1/messages",
      "POST",
      { to: "+91 90146 83627", type: "template", template: { name: "order_confirmation" } },
      rawKey
    );
    const res2 = await POST_MESSAGES(req2);
    assert(res2.status === 200, `Expected 200 for '+91 90146 83627', got ${res2.status}`);

    console.log("✔ Both '919014683627' and '+91 90146 83627' successfully matched allowed recipient");
  }

  // -------------------------------------------------------------
  // Test 7: Disallowed recipient returns generic 403 & writes audit row with reason recipient_not_allowed
  // -------------------------------------------------------------
  {
    console.log("\n▶ Test 7: Disallowed recipient handling & audit logging");
    const DISALLOWED_PHONE = "+91 98765 43210";
    const req = createJsonRequest(
      "http://localhost:3000/api/v1/messages",
      "POST",
      { to: DISALLOWED_PHONE, type: "template", template: { name: "order_confirmation" } },
      rawKey
    );

    const res = await POST_MESSAGES(req);
    assert(res.status === 403, `Expected 403, got ${res.status}`);
    const json = await res.json();
    assert(json.error === "Forbidden", "Expected generic Forbidden error message");

    // Check audit log row
    const { logs } = await auditRepo.find({ event: "forbidden", api_key_id: initialKey.id });
    const match = logs.find((l) => l.reason === "recipient_not_allowed");
    assert(Boolean(match), "Audit row must exist with reason 'recipient_not_allowed'");
    assert(match?.outcome === "failure", "Audit outcome must be failure");
    assert(match?.recipient_masked === maskRecipientPhone("+919876543210"), `Audit recipient must be masked (+91••••••3210), got ${match?.recipient_masked}`);

    console.log(`✔ Generic 403 returned, audit logged with reason='recipient_not_allowed', masked=${match?.recipient_masked}`);
  }

  console.log("\n🎉 ALL API KEY EDIT & NORMALIZATION TESTS PASSED!\n");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
