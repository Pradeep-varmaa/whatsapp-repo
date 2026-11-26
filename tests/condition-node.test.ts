import { validateGraph } from "../src/server/workflows/validation";
import { WorkflowGraph, CONDITION_OPERATORS } from "../src/server/workflows/types";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runTests() {
  console.log("=== Running Condition (If/Else) Node Tests ===\n");

  // 1. Operator Constants
  {
    assert(Array.isArray(CONDITION_OPERATORS), "CONDITION_OPERATORS is array");
    assert(CONDITION_OPERATORS.includes("equals"), "has equals");
    assert(CONDITION_OPERATORS.includes("not_equals"), "has not_equals");
    assert(CONDITION_OPERATORS.includes("contains"), "has contains");
    assert(CONDITION_OPERATORS.includes("greater_than"), "has greater_than");
    assert(CONDITION_OPERATORS.includes("is_empty"), "has is_empty");
    console.log("✔ Condition operators verified:", CONDITION_OPERATORS.join(", "));
  }

  // 2. Valid Graph with Condition Node
  {
    const validGraph: WorkflowGraph = {
      nodes: [
        { id: "node_trigger_1", type: "trigger", data: { keyword: "start" } },
        { id: "node_ask_1", type: "ask", data: { text: "What is your order total?", var: "total", kind: "number" } },
        {
          id: "node_cond_1",
          type: "condition",
          data: { variable: "total", operator: "greater_than", value: "100" },
        },
        { id: "node_msg_vip", type: "message", data: { text: "You get VIP free shipping!" } },
        { id: "node_msg_regular", type: "message", data: { text: "Shipping fee is $10." } },
        { id: "node_end_1", type: "end", data: { text: "Bye" } },
      ],
      edges: [
        { from: "node_trigger_1", to: "node_ask_1", port: "next" },
        { from: "node_ask_1", to: "node_cond_1", port: "next" },
        { from: "node_cond_1", to: "node_msg_vip", port: "true" },
        { from: "node_cond_1", to: "node_msg_regular", port: "false" },
        { from: "node_msg_vip", to: "node_end_1", port: "next" },
        { from: "node_msg_regular", to: "node_end_1", port: "next" },
      ],
    };

    const res = validateGraph(validGraph);
    assert(res.valid === true, `Valid condition graph should pass: ${res.errors.join(", ")}`);
    console.log("✔ Valid condition graph passed validation");
  }

  // 3. Invalid Graph: Missing False port
  {
    const missingPortGraph: WorkflowGraph = {
      nodes: [
        { id: "node_trigger_1", type: "trigger", data: { keyword: "start" } },
        {
          id: "node_cond_1",
          type: "condition",
          data: { variable: "vip", operator: "equals", value: "yes" },
        },
        { id: "node_end_1", type: "end", data: { text: "Bye" } },
      ],
      edges: [
        { from: "node_trigger_1", to: "node_cond_1", port: "next" },
        { from: "node_cond_1", to: "node_end_1", port: "true" },
        // "false" port missing
      ],
    };

    const res = validateGraph(missingPortGraph);
    assert(res.valid === false, "Missing false port should fail validation");
    assert(
      res.errors.some((e) => e.includes('"false"') || e.includes("output port is not connected")),
      `Error should mention missing false port: ${res.errors.join("; ")}`
    );
    console.log("✔ Missing false port validation caught correctly:", res.errors[0]);
  }

  // 4. Invalid Graph: Missing Variable
  {
    const missingVarGraph: WorkflowGraph = {
      nodes: [
        { id: "node_trigger_1", type: "trigger", data: { keyword: "start" } },
        {
          id: "node_cond_1",
          type: "condition",
          data: { variable: "", operator: "equals", value: "yes" },
        },
        { id: "node_end_1", type: "end", data: { text: "Bye" } },
      ],
      edges: [
        { from: "node_trigger_1", to: "node_cond_1", port: "next" },
        { from: "node_cond_1", to: "node_end_1", port: "true" },
        { from: "node_cond_1", to: "node_end_1", port: "false" },
      ],
    };

    const res = validateGraph(missingVarGraph);
    assert(res.valid === false, "Empty variable should fail validation");
    console.log("✔ Empty variable caught correctly:", res.errors[0]);
  }

  console.log("\n🎉 ALL CONDITION NODE TESTS PASSED!\n");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
