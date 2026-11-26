import { validateGraph } from "../src/server/workflows/validation";
import { WorkflowGraph, CALCULATION_OPERATIONS } from "../src/server/workflows/types";
import { generateHeuristicGraph } from "../src/server/workflows/generate";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runTests() {
  console.log("=== Running Calculation (Date Diff & Math) Node Tests ===\n");

  // 1. Calculation Operations Constants
  {
    assert(Array.isArray(CALCULATION_OPERATIONS), "CALCULATION_OPERATIONS is array");
    assert(CALCULATION_OPERATIONS.includes("date_diff_days"), "has date_diff_days");
    assert(CALCULATION_OPERATIONS.includes("date_diff_hours"), "has date_diff_hours");
    assert(CALCULATION_OPERATIONS.includes("date_add_days"), "has date_add_days");
    assert(CALCULATION_OPERATIONS.includes("add"), "has add");
    assert(CALCULATION_OPERATIONS.includes("multiply"), "has multiply");
    assert(CALCULATION_OPERATIONS.includes("percentage"), "has percentage");
    assert(CALCULATION_OPERATIONS.includes("formula"), "has formula");
    console.log("✔ Calculation operations verified:", CALCULATION_OPERATIONS.join(", "));
  }

  // 2. Valid Graph with Date Difference and Math Calculation Nodes
  {
    const validGraph: WorkflowGraph = {
      nodes: [
        { id: "node_trigger_1", type: "trigger", data: { keyword: "BOOK" } },
        { id: "node_ask_in", type: "ask", data: { text: "Select Check-in:", var: "checkin_date", kind: "date" } },
        { id: "node_ask_out", type: "ask", data: { text: "Select Check-out:", var: "checkout_date", kind: "date" } },
        {
          id: "node_calc_diff",
          type: "calculation",
          data: {
            operation: "date_diff_days",
            operand_a: "{{checkin_date}}",
            operand_b: "{{checkout_date}}",
            save_to: "stay_days",
            label: "Calculate Nights",
          },
        },
        {
          id: "node_calc_cost",
          type: "calculation",
          data: {
            operation: "multiply",
            operand_a: "{{stay_days}}",
            operand_b: "150",
            save_to: "total_cost",
            round_decimals: 2,
            label: "Calculate Total Cost",
          },
        },
        {
          id: "node_msg_summary",
          type: "message",
          data: { text: "Your stay is {{stay_days}} nights for ${{total_cost}}." },
        },
        { id: "node_end_1", type: "end", data: { text: "Thank you" } },
      ],
      edges: [
        { from: "node_trigger_1", to: "node_ask_in", port: "next" },
        { from: "node_ask_in", to: "node_ask_out", port: "next" },
        { from: "node_ask_out", to: "node_calc_diff", port: "next" },
        { from: "node_calc_diff", to: "node_calc_cost", port: "next" },
        { from: "node_calc_cost", to: "node_msg_summary", port: "next" },
        { from: "node_msg_summary", to: "node_end_1", port: "next" },
      ],
    };

    const res = validateGraph(validGraph);
    assert(res.valid === true, `Valid calculation graph should pass: ${res.errors.join(", ")}`);
    console.log("✔ Valid graph with date diff and math calculation passed validation");
  }

  // 3. Invalid Calculation: Missing save_to variable
  {
    const invalidGraph: WorkflowGraph = {
      nodes: [
        { id: "node_trigger_1", type: "trigger", data: { keyword: "BOOK" } },
        {
          id: "node_calc_bad",
          type: "calculation",
          data: {
            operation: "add",
            operand_a: "10",
            operand_b: "20",
            // missing save_to
          },
        },
        { id: "node_end_1", type: "end", data: { text: "Done" } },
      ],
      edges: [
        { from: "node_trigger_1", to: "node_calc_bad", port: "next" },
        { from: "node_calc_bad", to: "node_end_1", port: "next" },
      ],
    };

    const res = validateGraph(invalidGraph);
    assert(res.valid === false, "Missing save_to should fail validation");
    console.log("✔ Validation correctly rejected calculation node missing save_to target");
  }

  // 4. Generate Heuristic Graph containing Calculation nodes
  {
    const generated = generateHeuristicGraph("Calculate stay duration between check-in and check-out and price quotation");
    assert(Boolean(generated), "Heuristic generator produced a workflow");
    assert(generated.graph.nodes.some((n) => n.type === "calculation"), "Generated workflow includes calculation nodes");
    const valRes = validateGraph(generated.graph);
    assert(valRes.valid, `Generated calculation workflow must be valid: ${valRes.errors.join(", ")}`);
    console.log("✔ AI / Heuristic generator created a valid workflow with calculation nodes");
  }

  console.log("\n🎉 ALL CALCULATION NODE TESTS PASSED SUCCESSFULLY!\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
