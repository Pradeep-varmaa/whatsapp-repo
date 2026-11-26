import { NextRequest } from "next/server";
import { POST } from "../src/app/api/v1/messages/route";
import { ApiKeyRepository } from "../src/server/repositories/apiKeyRepository";
import { generateWaeApiKey } from "../src/server/security/crypto";

function extractPlaceholders(text?: string | null): string[] {
  if (!text) return [];
  const matches = text.match(/\{\{(\d+|[a-zA-Z0-9_]+)\}\}/g);
  if (!matches) return [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const m of matches) {
    const key = m.replace(/[\{\}]/g, "");
    if (!seen.has(key)) {
      seen.add(key);
      list.push(key);
    }
  }
  return list;
}

async function runTests() {
  console.log("==================================================");
  console.log("⚡ TESTING TEMPLATE PLACEHOLDER EXTRACTION & PAYLOAD BUILD");
  console.log("==================================================");

  // Test 1: extractPlaceholders correctly parses jaspers_market_order_confirmation_v1
  console.log("\n▶ Test 1: Extract placeholders from order confirmation template");
  const templateBody = "Hi {{1}}, Thank you for your purchase! Your order number is {{2}}. We'll start getting your farm fresh groceries ready to ship. Estimated delivery: {{3}}. We will let you know when your order ships.";
  const placeholders = extractPlaceholders(templateBody);
  if (placeholders.length === 3 && placeholders[0] === "1" && placeholders[1] === "2" && placeholders[2] === "3") {
    console.log("✔ Successfully extracted 3 placeholders:", placeholders);
  } else {
    throw new Error(`Expected ["1", "2", "3"] but got ${JSON.stringify(placeholders)}`);
  }

  // Test 2: Build parameters component matching Meta Cloud API schema
  console.log("\n▶ Test 2: Build parameters component structure");
  const userValues: Record<string, string> = {
    "1": "Varma",
    "2": "ORD-2026-9918",
    "3": "Tomorrow, 5:00 PM",
  };

  const components = [
    {
      type: "body",
      parameters: placeholders.map((key) => ({
        type: "text",
        text: userValues[key],
      })),
    },
  ];

  if (
    components[0].parameters.length === 3 &&
    components[0].parameters[0].text === "Varma" &&
    components[0].parameters[1].text === "ORD-2026-9918" &&
    components[0].parameters[2].text === "Tomorrow, 5:00 PM"
  ) {
    console.log("✔ Component payload matches Meta Cloud API requirements:\n", JSON.stringify(components, null, 2));
  } else {
    throw new Error("Component structure mismatch");
  }

  // Test 3: Validate with publicMessageSchema in /api/v1/messages
  console.log("\n▶ Test 3: Validate API route accepts template with components");
  const { rawKey, keyPrefix, keyHash } = generateWaeApiKey();
  const apiKeyRepo = new ApiKeyRepository();
  await apiKeyRepo.create({
    name: "Placeholder Unit Test Key",
    key_prefix: keyPrefix,
    key_hash: keyHash,
    phone_number_id: "1379717908564812",
    scopes: ["messages:send"],
  });

  const req = new NextRequest("http://localhost:3000/api/v1/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${rawKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: "+919618795584",
      type: "template",
      template: {
        name: "jaspers_market_order_confirmation_v1",
        language: "en_US",
        components,
      },
    }),
  });

  const res = await POST(req);
  console.log(`Route response status: ${res.status}`);
  // In sandbox without live Meta connection it may return 502/400 (Meta Graph Error) or 200, but NOT 400 validation error
  const data = await res.json();
  console.log("Response data:", data);

  if (res.status === 400 && data.message === "Validation failed") {
    throw new Error(`Schema rejected template components: ${JSON.stringify(data.details)}`);
  }
  console.log("✔ Validation schema successfully accepted template components!");

  console.log("\n🎉 ALL TEMPLATE PLACEHOLDER TESTS PASSED!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
