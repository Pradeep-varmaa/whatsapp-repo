/**
 * Automated Test Suite for Workflow Redesign
 * Tests:
 * 1. Node insertion into normal and branch edges (preserving port / option handles)
 * 2. Node deletion and 1-in-1-out edge auto-reconnection
 * 3. Validator accepting "date" and rejecting unknown validation kinds
 */

import { validateGraph, askNodeDataSchema } from "../src/server/workflows/validation";
import { ASK_VALIDATION_KINDS, WorkflowGraph } from "../src/server/workflows/types";
import {
  insertNodeIntoEdge,
  deleteNodeAndReconnect,
  computeExecutionOrder,
  autoLayoutWorkflow,
} from "../src/components/workflow/workflowUtils";
import { Node, Edge } from "@xyflow/react";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ ${message}`);
  }
}

async function runTests() {
  console.log("==========================================");
  console.log("TEST 1: Validator accepts 'date' & rejects unknown kinds");
  console.log("==========================================");

  // 1a. Verify ASK_VALIDATION_KINDS contains 'date'
  assert(
    (ASK_VALIDATION_KINDS as readonly string[]).includes("date"),
    "ASK_VALIDATION_KINDS constant includes 'date'"
  );

  // 1b. Schema validation accepts 'date'
  const validAskDate = askNodeDataSchema.safeParse({
    text: "Please select your appointment date:",
    var: "appointment_date",
    kind: "date",
  });
  assert(validAskDate.success, "askNodeDataSchema successfully validates kind='date'");

  // 1c. Schema validation rejects unknown kind with dynamic error message
  const invalidAsk = askNodeDataSchema.safeParse({
    text: "Please select your appointment date:",
    var: "appointment_date",
    kind: "invalid_xyz",
  });
  assert(!invalidAsk.success, "askNodeDataSchema rejects unknown kind 'invalid_xyz'");
  if (!invalidAsk.success) {
    const errorMsg = invalidAsk.error.issues[0]?.message || "";
    assert(
      errorMsg.includes('expected one of "text"|"number"|"email"|"date"|"time"'),
      `Error message is built from shared constant: "${errorMsg}"`
    );
  }

  // 1d. Full graph validation accepts flow with ask node of kind 'date'
  const validGraphWithDate: WorkflowGraph = {
    nodes: [
      { id: "node_trigger", type: "trigger", data: { type: "keyword", keyword: "apply leave" } },
      { id: "node_ask_date", type: "ask", data: { text: "Select date:", var: "selected_date", kind: "date" } },
      { id: "node_end", type: "end", data: { text: "Thank you" } },
    ],
    edges: [
      { from: "node_trigger", port: "next", to: "node_ask_date" },
      { from: "node_ask_date", port: "next", to: "node_end" },
    ],
  };
  const valResult = validateGraph(validGraphWithDate);
  assert(valResult.valid, `Graph with kind='date' passes validation (0 errors: ${valResult.errors.join(", ")})`);

  console.log("\n==========================================");
  console.log("TEST 2: Splicing / Inserting a node into a normal edge");
  console.log("==========================================");

  const initialNodes: Node[] = [
    { id: "node_trigger", type: "trigger", position: { x: 350, y: 50 }, data: { keyword: "hi" } },
    { id: "node_end", type: "end", position: { x: 350, y: 300 }, data: { text: "done" } },
  ];
  const initialEdges: Edge[] = [
    { id: "e1", source: "node_trigger", sourceHandle: "next", target: "node_end" },
  ];

  const insertResult = insertNodeIntoEdge(initialNodes, initialEdges, "e1", "message", { text: "Inserted message" });

  assert(insertResult.newNodes.length === 3, "New node added to nodes array");
  assert(insertResult.newEdges.length === 2, "Original edge replaced with 2 rewired edges");

  const edgeFromTrigger = insertResult.newEdges.find((e) => e.source === "node_trigger");
  assert(edgeFromTrigger?.target === insertResult.newNodeId, "Source connects to new inserted node");
  assert(edgeFromTrigger?.sourceHandle === "next", "Source handle 'next' is preserved");

  const edgeToTarget = insertResult.newEdges.find((e) => e.target === "node_end");
  assert(edgeToTarget?.source === insertResult.newNodeId, "New node connects to original target");

  console.log("\n==========================================");
  console.log("TEST 3: Inserting a node into a List Menu Branch edge");
  console.log("==========================================");

  const listNodes: Node[] = [
    { id: "node_trigger", type: "trigger", position: { x: 350, y: 50 }, data: {} },
    {
      id: "node_list",
      type: "list",
      position: { x: 350, y: 150 },
      data: {
        text: "Select item:",
        opts: [
          { id: "row_opt_1", title: "Option 1" },
          { id: "row_opt_2", title: "Option 2" },
        ],
      },
    },
    { id: "node_end_branch", type: "end", position: { x: 600, y: 300 }, data: {} },
  ];
  const listEdges: Edge[] = [
    { id: "e_trig", source: "node_trigger", sourceHandle: "next", target: "node_list" },
    { id: "e_branch_2", source: "node_list", sourceHandle: "row_opt_2", target: "node_end_branch" },
  ];

  const branchInsert = insertNodeIntoEdge(listNodes, listEdges, "e_branch_2", "ask", {
    text: "Appointment date:",
    var: "appt_date",
    kind: "date",
  });

  const branchEdge1 = branchInsert.newEdges.find((e) => e.source === "node_list");
  assert(
    branchEdge1?.sourceHandle === "row_opt_2",
    "List option port handle 'row_opt_2' is strictly preserved when inserting into branch"
  );
  assert(branchEdge1?.target === branchInsert.newNodeId, "Branch option routes directly to new inserted node");

  console.log("\n==========================================");
  console.log("TEST 4: Deleting a node with 1-in-1-out auto-reconnection");
  console.log("==========================================");

  // Setup: Trigger -> Message -> End
  const threeNodes: Node[] = [
    { id: "n1", type: "trigger", position: { x: 350, y: 50 }, data: {} },
    { id: "n2", type: "message", position: { x: 350, y: 150 }, data: {} },
    { id: "n3", type: "end", position: { x: 350, y: 250 }, data: {} },
  ];
  const threeEdges: Edge[] = [
    { id: "e_1_2", source: "n1", sourceHandle: "next", target: "n2" },
    { id: "e_2_3", source: "n2", sourceHandle: "next", target: "n3" },
  ];

  const deleteResult = deleteNodeAndReconnect(threeNodes, threeEdges, "n2");
  assert(deleteResult.success, "Deletion succeeded");
  assert(deleteResult.reconnected, "Auto-reconnection flag is true");
  assert(deleteResult.newNodes.length === 2, "Node n2 is removed");
  assert(deleteResult.newEdges.length === 1, "Exactly 1 reconnected edge remains");
  assert(deleteResult.newEdges[0].source === "n1", "Reconnected edge originates at n1");
  assert(deleteResult.newEdges[0].target === "n3", "Reconnected edge terminates at n3");

  console.log("\n==========================================");
  console.log("TEST 5: Deleting Trigger is prevented");
  console.log("==========================================");

  const deleteTriggerResult = deleteNodeAndReconnect(threeNodes, threeEdges, "n1");
  assert(!deleteTriggerResult.success, "Deleting trigger node is rejected");
  assert(deleteTriggerResult.error?.includes("Trigger node cannot be deleted") || false, "Error explains Trigger cannot be deleted");

  console.log("\n==========================================");
  console.log("TEST 6: Auto-Layout & Execution Ordering");
  console.log("==========================================");

  const orderSteps = computeExecutionOrder(threeNodes, threeEdges);
  assert(orderSteps.length === 3, "All 3 nodes ordered");
  assert(orderSteps[0].node.id === "n1" && orderSteps[0].stepNumber === 1, "Step 1 is Trigger");
  assert(orderSteps[1].node.id === "n2" && orderSteps[1].stepNumber === 2, "Step 2 is Message");
  assert(orderSteps[2].node.id === "n3" && orderSteps[2].stepNumber === 3, "Step 3 is End");

  const laidOut = autoLayoutWorkflow(threeNodes, threeEdges);
  assert(laidOut.length === 3, "Layout returned all nodes");
  assert(laidOut[0].position.y < laidOut[1].position.y, "Trigger placed above Message");
  assert(laidOut[1].position.y < laidOut[2].position.y, "Message placed above End");

  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("Test failed with exception:", err);
  process.exit(1);
});
