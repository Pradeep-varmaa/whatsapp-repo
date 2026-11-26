/**
 * Test Suite: Templates Management & Drag-and-Drop Creation
 *
 * Validates:
 * 1. GET /api/v1/meta/templates returns live and repository templates
 * 2. POST /api/v1/meta/templates validates and creates new template with components
 * 3. Rejects invalid names (uppercase / spaces) per Meta requirements
 * 4. DELETE /api/v1/meta/templates removes the template
 */

import { NextRequest } from "next/server";
import { GET, POST, DELETE } from "../src/app/api/v1/meta/templates/route";
import { TemplateRepository } from "../src/server/repositories/templateRepository";
import { signJwt } from "../src/server/security/crypto";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function createJsonRequest(url: string, method: string, body?: unknown, token?: string): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function runTemplateTests() {
  console.log("==================================================");
  console.log("⚡ TESTING TEMPLATES TAB & CREATION WORKFLOW");
  console.log("==================================================\n");

  const adminToken = signJwt({
    userId: "usr_admin_001",
    email: "admin@company.com",
    role: "admin",
  });

  const repo = new TemplateRepository();

  // Test 1: Fetch Templates
  {
    console.log("▶ Test 1: GET /api/v1/meta/templates lists available templates");
    const req = createJsonRequest("http://localhost:3000/api/v1/meta/templates", "GET", undefined, adminToken);
    const res = await GET(req);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.success === true, "Response must be success");
    assert(Array.isArray(json.data.templates), "Templates must be an array");
    console.log(`✔ Found ${json.data.templates.length} dynamic templates from Meta/DB`);
  }

  // Test 2: Validation of invalid template name
  {
    console.log("\n▶ Test 2: Reject invalid template names (e.g. uppercase, spaces)");
    const invalidPayload = {
      name: "INVALID TEMPLATE NAME WITH SPACES",
      category: "UTILITY",
      language: "en_US",
      components: [{ type: "BODY", text: "Test text" }],
    };
    const req = createJsonRequest("http://localhost:3000/api/v1/meta/templates", "POST", invalidPayload, adminToken);
    const res = await POST(req);
    assert(res.status === 400, `Expected 400 validation error, got ${res.status}`);
    console.log("✔ Correctly rejected invalid template name format");
  }

  // Test 3: Create valid template with drag-and-drop component structure
  const TEST_TEMPLATE_NAME = `dnd_order_tracker_${Date.now()}`;
  {
    console.log("\n▶ Test 3: POST /api/v1/meta/templates creates drag-and-drop template structure");
    const validPayload = {
      name: TEST_TEMPLATE_NAME,
      category: "UTILITY",
      language: "en_US",
      components: [
        {
          type: "HEADER",
          format: "TEXT",
          text: "Order Tracking #{{1}}",
        },
        {
          type: "BODY",
          text: "Hello {{1}}, your order {{2}} is on its way with tracking ID {{3}}.",
        },
        {
          type: "FOOTER",
          text: "Reply STOP to cancel notifications",
        },
        {
          type: "BUTTONS",
          buttons: [
            { type: "URL", text: "Track Package", url: "https://example.com/track" },
            { type: "QUICK_REPLY", text: "Contact Agent" },
          ],
        },
      ],
    };

    const req = createJsonRequest("http://localhost:3000/api/v1/meta/templates", "POST", validPayload, adminToken);
    const res = await POST(req);
    assert(res.status === 201, `Expected 201 Created, got ${res.status}`);
    const json = await res.json();
    assert(json.success === true, "Response must be success");
    assert(json.data.name === TEST_TEMPLATE_NAME, "Created template must match name");
    assert(json.data.components.length === 4, "Must preserve all 4 components (Header, Body, Footer, Buttons)");

    // Verify template now exists in repository
    const stored = await repo.findByName(TEST_TEMPLATE_NAME);
    assert(Boolean(stored), "Template must be persisted in repository");
    assert(stored?.category === "UTILITY", "Category must match");
    console.log(`✔ Template ${TEST_TEMPLATE_NAME} created with 4 components (Header, Body, Footer, Buttons)`);
  }

  // Test 4: Delete template
  {
    console.log("\n▶ Test 4: DELETE /api/v1/meta/templates removes template");
    const req = createJsonRequest(
      `http://localhost:3000/api/v1/meta/templates?name=${TEST_TEMPLATE_NAME}`,
      "DELETE",
      undefined,
      adminToken
    );
    const res = await DELETE(req);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.success === true, "Delete response must be success");

    const check = await repo.findByName(TEST_TEMPLATE_NAME);
    assert(!check, "Deleted template must not exist in repository");
    console.log(`✔ Template ${TEST_TEMPLATE_NAME} successfully deleted`);
  }

  console.log("\n🎉 ALL TEMPLATE TESTS PASSED SUCCESSFULLY!\n");
}

runTemplateTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
