import { validateGraph } from "../src/server/workflows/validation";
import {
  parseAndNormalizeDate,
  parseAndNormalizeTime,
  resolveTimeSlotLabel,
  isCustomTimeSlot,
} from "../src/server/workflows/dateUtils";
import { ASK_KINDS, normalizeAskKind, WorkflowGraph } from "../src/server/workflows/types";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runTests() {
  console.log("=== Running Ask Node & Date Validation Tests ===\n");

  // 1. Test Shared Constants
  {
    assert(Array.isArray(ASK_KINDS), "ASK_KINDS should be an array");
    assert(ASK_KINDS.includes("date"), "ASK_KINDS must include 'date'");
    assert(ASK_KINDS.includes("text"), "ASK_KINDS must include 'text'");
    assert(ASK_KINDS.includes("number"), "ASK_KINDS must include 'number'");
    assert(ASK_KINDS.includes("email"), "ASK_KINDS must include 'email'");
    console.log("✔ Shared ASK_KINDS constant verified:", ASK_KINDS.join(", "));
  }

  // 2. Test Date Parser and Normalizer
  {
    assert(parseAndNormalizeDate("2026-11-25") === "2026-11-25", "ISO YYYY-MM-DD parsing");
    assert(parseAndNormalizeDate("2026/11/25") === "2026-11-25", "Slash YYYY/MM/DD parsing");
    assert(parseAndNormalizeDate("25/11/2026") === "2026-11-25", "DD/MM/YYYY parsing");
    assert(parseAndNormalizeDate("25-11-2026") === "2026-11-25", "DD-MM-YYYY parsing");

    // Relative dates
    const ref = new Date(2026, 10, 17); // Nov 17 2026
    assert(parseAndNormalizeDate("today", ref) === "2026-11-17", "Today parsing");
    assert(parseAndNormalizeDate("tomorrow", ref) === "2026-11-18", "Tomorrow parsing");

    // Invalid dates
    assert(parseAndNormalizeDate("31/02/2026") === null, "Feb 31 should be rejected");
    assert(parseAndNormalizeDate("2026-02-30") === null, "Feb 30 should be rejected");
    assert(parseAndNormalizeDate("25/13/2026") === null, "Month 13 should be rejected");
    assert(parseAndNormalizeDate("hello world") === null, "Random string should be rejected");
    assert(parseAndNormalizeDate("") === null, "Empty string should be rejected");
    console.log("✔ Date parsing and validation tests passed");
  }

  // 3. Test Legacy Normalization
  {
    assert(normalizeAskKind("calendar") === "date", "calendar maps to date");
    assert(normalizeAskKind("datetime") === "date", "datetime maps to date");
    assert(normalizeAskKind("string") === "text", "string maps to text");
    assert(normalizeAskKind("numeric") === "number", "numeric maps to number");
    assert(normalizeAskKind("int") === "number", "int maps to number");
    assert(normalizeAskKind("unknown_xyz") === "text", "unknown maps to text fallback");
    console.log("✔ Legacy ask kind normalization tests passed");
  }

  // 4. Test Graph Validation with Date Ask Node
  {
    const validGraph: WorkflowGraph = {
      nodes: [
        { id: "node_trigger_1", type: "trigger", data: { keyword: "hi" } },
        { id: "node_ask_2020", type: "ask", data: { text: "Select your date", var: "selected_date", kind: "date" } },
        { id: "node_end_1", type: "end", data: { text: "Done" } },
      ],
      edges: [
        { from: "node_trigger_1", to: "node_ask_2020", port: "next" },
        { from: "node_ask_2020", to: "node_end_1", port: "next" },
      ],
    };

    const res = validateGraph(validGraph);
    assert(res.valid === true, `Valid graph with 'date' kind should pass: ${res.errors.join(", ")}`);
    console.log("✔ Graph validation with 'date' ask node passed");
  }

  // 5. Test Graph Validation with Invalid Ask Kind & Dynamic Error Message
  {
    const invalidGraph: WorkflowGraph = {
      nodes: [
        { id: "node_trigger_1", type: "trigger", data: { keyword: "hi" } },
        { id: "node_ask_2020", type: "ask", data: { text: "Select", var: "selected_date", kind: "invalid_kind_123" } },
        { id: "node_end_1", type: "end", data: { text: "Done" } },
      ],
      edges: [
        { from: "node_trigger_1", to: "node_ask_2020", port: "next" },
        { from: "node_ask_2020", to: "node_end_1", port: "next" },
      ],
    };

    const res = validateGraph(invalidGraph);
    assert(res.valid === false, "Graph with invalid ask kind should fail validation");
    assert(
      res.errors.some((err) => err.includes("expected one of") && err.includes('"date"')),
      `Error message should dynamically list allowed kinds including "date": ${res.errors.join("; ")}`
    );
    console.log("✔ Dynamic validation error message tested successfully:", res.errors[0]);
  }

  // 6. Test Time Parsing
  {
    // 12-hour formats
    assert(parseAndNormalizeTime("10:00 AM") === "10:00 AM", "10:00 AM passthrough");
    assert(parseAndNormalizeTime("2:30 PM") === "02:30 PM", "2:30 PM normalize");
    assert(parseAndNormalizeTime("10 am") === "10:00 AM", "10 am → 10:00 AM");
    // 24-hour format
    assert(parseAndNormalizeTime("14:30") === "14:30", "24h 14:30");
    assert(parseAndNormalizeTime("09:00") === "09:00", "24h 09:00");
    // Hour-only integer
    assert(parseAndNormalizeTime("10") === "10:00 AM", "hour 10 → AM");
    assert(parseAndNormalizeTime("15") === "15:00", "hour 15 → 24h");
    // Range passthrough
    assert(
      parseAndNormalizeTime("10:00 AM - 11:00 AM") === "10:00 AM - 11:00 AM",
      "Range passthrough"
    );
    // Invalid
    assert(parseAndNormalizeTime("22") === "22:00", "22 hour-only → 22:00");
    assert(parseAndNormalizeTime("hello") === null, "text should be rejected");
    assert(parseAndNormalizeTime("") === null, "empty string should be rejected");
    assert(parseAndNormalizeTime("99:99 AM") === null, "invalid 99:99 AM rejected");
    console.log("✔ Time parsing tests passed");
  }

  // 7. Test slot helpers
  {
    assert(resolveTimeSlotLabel("slot_10am") === "10:00 AM - 11:00 AM", "slot_10am label");
    assert(resolveTimeSlotLabel("slot_02pm") === "02:00 PM - 03:00 PM", "slot_02pm label");
    assert(resolveTimeSlotLabel("slot_custom") === null, "slot_custom has no pre-defined label");
    assert(resolveTimeSlotLabel(null) === null, "null replyId returns null");
    assert(isCustomTimeSlot("slot_custom") === true, "slot_custom is custom");
    assert(isCustomTimeSlot("slot_10am") === false, "slot_10am is not custom");
    assert(isCustomTimeSlot(null) === false, "null is not custom");
    console.log("✔ Time slot helper tests passed");
  }

  console.log("\n🎉 ALL TASK 1 TESTS PASSED!\n");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
