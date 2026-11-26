import { cloneWorkflowGraph, getClonedWorkflowName } from "../src/server/workflows/clone";
import { validateGraph } from "../src/server/workflows/validation";
import { WorkflowGraph } from "../src/server/workflows/types";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runTests() {
  console.log("=== Running Workflow Clone & Duplication Unit Tests ===\n");

  // 1. Test Copy Name Generation
  {
    assert(getClonedWorkflowName("Support Bot") === "Support Bot (copy)", "First copy name");
    assert(getClonedWorkflowName("Support Bot (copy)") === "Support Bot (copy 2)", "Second copy name");
    assert(getClonedWorkflowName("Support Bot (copy 2)") === "Support Bot (copy 3)", "Third copy name");
    console.log("✔ getClonedWorkflowName tests passed");
  }

  // 2. Test cloneWorkflowGraph with multi-step graph including ask (date), list, api, end
  {
    const originalGraph: WorkflowGraph = {
      nodes: [
        {
          id: "node_trigger_orig",
          type: "trigger",
          position: { x: 100, y: 100 },
          data: { keyword: "BOOK, APPOINTMENT" },
        },
        {
          id: "node_ask_orig",
          type: "ask",
          position: { x: 100, y: 220 },
          data: { text: "Select your preferred date:", var: "selected_date", kind: "date" },
        },
        {
          id: "node_api_orig",
          type: "api",
          position: { x: 100, y: 340 },
          data: { url: "https://api.example.com/slots", method: "GET", save: "slots" },
        },
        {
          id: "node_list_orig",
          type: "list",
          position: { x: 100, y: 460 },
          data: {
            text: "Select a time slot:",
            buttonText: "Slots",
            is_dynamic: true,
            array_path: "{{slots.data}}",
            title_field: "time",
            description_field: "doctor",
            id_field: "slot_id",
          },
        },
        {
          id: "node_end_orig",
          type: "end",
          position: { x: 100, y: 580 },
          data: { text: "Thank you! Appointment booked." },
        },
        {
          id: "node_end_err",
          type: "end",
          position: { x: 300, y: 580 },
          data: { text: "Service temporarily unavailable." },
        },
      ],
      edges: [
        { id: "e1", from: "node_trigger_orig", port: "next", to: "node_ask_orig" },
        { id: "e2", from: "node_ask_orig", port: "next", to: "node_api_orig" },
        { id: "e3", from: "node_api_orig", port: "success", to: "node_list_orig" },
        { id: "e3_err", from: "node_api_orig", port: "error", to: "node_end_err" },
        { id: "e4", from: "node_list_orig", port: "next", to: "node_end_orig" },
      ],
    };

    const { graph: cloned, idMap } = cloneWorkflowGraph(originalGraph);

    // Verify node count matches
    assert(cloned.nodes.length === originalGraph.nodes.length, "Cloned nodes length match");
    assert(cloned.edges.length === originalGraph.edges.length, "Cloned edges length match");

    // Verify all node IDs are new and distinct
    const originalNodeIds = new Set(originalGraph.nodes.map((n) => n.id));
    for (const node of cloned.nodes) {
      assert(!originalNodeIds.has(node.id), `Node ID ${node.id} must be brand new`);
      assert(idMap.has(node.id) === false, "idMap values should be the new IDs");
    }

    // Verify all edge IDs are new and distinct
    const originalEdgeIds = new Set(originalGraph.edges.map((e) => e.id));
    for (const edge of cloned.edges) {
      assert(!originalEdgeIds.has(edge.id), `Edge ID ${edge.id} must be brand new`);
    }

    // Verify edge references updated properly
    assert(cloned.edges[0].from === idMap.get("node_trigger_orig"), "Edge 1 from remapped");
    assert(cloned.edges[0].to === idMap.get("node_ask_orig"), "Edge 1 to remapped");
    assert(cloned.edges[0].port === "next", "Edge 1 port preserved");

    assert(cloned.edges[1].from === idMap.get("node_ask_orig"), "Edge 2 from remapped");
    assert(cloned.edges[1].to === idMap.get("node_api_orig"), "Edge 2 to remapped");

    assert(cloned.edges[2].from === idMap.get("node_api_orig"), "Edge 3 from remapped");
    assert(cloned.edges[2].port === "success", "Edge 3 port preserved");
    assert(cloned.edges[2].to === idMap.get("node_list_orig"), "Edge 3 to remapped");

    assert(cloned.edges[3].from === idMap.get("node_api_orig"), "Edge 3_err from remapped");
    assert(cloned.edges[3].port === "error", "Edge 3_err port preserved");
    assert(cloned.edges[3].to === idMap.get("node_end_err"), "Edge 3_err to remapped");

    assert(cloned.edges[4].from === idMap.get("node_list_orig"), "Edge 4 from remapped");
    assert(cloned.edges[4].to === idMap.get("node_end_orig"), "Edge 4 to remapped");

    // Verify payload data preserved
    const clonedAsk = cloned.nodes.find((n) => n.type === "ask");
    assert(clonedAsk?.data?.kind === "date", "Ask date kind preserved in clone");
    assert(clonedAsk?.data?.var === "selected_date", "Ask var preserved in clone");

    const clonedList = cloned.nodes.find((n) => n.type === "list");
    assert(clonedList?.data?.is_dynamic === true, "Dynamic rows preserved");
    assert(clonedList?.data?.array_path === "{{slots.data}}", "Dynamic array path preserved");

    // Verify deep copy (modifying clone does not modify original)
    clonedAsk!.data.text = "Modified cloned text";
    const originalAsk = originalGraph.nodes.find((n) => n.id === "node_ask_orig");
    assert(originalAsk?.data?.text === "Select your preferred date:", "Original data unaffected by clone mutation");

    // Verify cloned graph validates cleanly with validateGraph
    const validation = validateGraph(cloned);
    assert(validation.valid === true, `Cloned graph should be valid: ${validation.errors.join(", ")}`);

    console.log("✔ cloneWorkflowGraph deep clone & reference remapping tests passed");
  }

  // 3. Test that invalid graph can be cloned and preserves validation warnings
  {
    const invalidGraph: WorkflowGraph = {
      nodes: [
        { id: "node_trigger_1", type: "trigger", data: {} },
        { id: "node_disconnected", type: "message", data: { text: "Unconnected" } },
      ],
      edges: [],
    };

    const { graph: cloned } = cloneWorkflowGraph(invalidGraph);
    const validation = validateGraph(cloned);
    assert(validation.valid === false, "Invalid graph clone still reports validation errors");
    assert(validation.errors.length > 0, "Validation errors preserved");
    console.log("✔ Cloned invalid graph reports validation errors without breaking clone pipeline");
  }

  console.log("\n🎉 ALL TASK 2 CLONE TESTS PASSED!\n");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
