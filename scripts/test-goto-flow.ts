/**
 * Automated Test Suite for "Go to Flow" Node
 *
 * Verifies:
 * 1. Node Schema & Port Requirements:
 *    - subflow mode requires outgoing edges on both "completed" and "error" ports.
 *    - handoff mode is treated as a valid terminal exit node (no outgoing edges required).
 * 2. Cross-Flow Cycle Detection:
 *    - Direct self-reference (A→A) rejected.
 *    - Mutual cycle (A→B→A) rejected.
 *    - Multi-step indirect cycle (A→B→C→A) rejected.
 *    - Valid DAG (A→B, A→C, B→D, C→D) accepted.
 * 3. Max Call Depth Enforcement:
 *    - Max call depth of 5 allowed.
 *    - Call depth of 6 rejected.
 * 4. Publish-Time Rules:
 *    - Target flow must be active/published on publish.
 *    - Draft target flow allowed when saving draft.
 * 5. Deletion Protection:
 *    - Deleting a workflow targeted by another workflow's goto_flow is blocked and lists referencing flows.
 */

import { validateGraph, gotoFlowNodeDataSchema } from "../src/server/workflows/validation";
import {
  validateCrossFlowGraph,
  checkWorkflowReferencesFromMap,
} from "../src/server/workflows/crossFlowValidation";
import { WorkflowGraph, WorkflowNode } from "../src/server/workflows/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ ${message}`);
  }
}

async function runTests() {
  console.log("=================================================");
  console.log("TEST 1: gotoFlowNodeDataSchema & validateGraph Port Rules");
  console.log("=================================================");

  // 1a. Validate valid handoff data
  const validHandoff = gotoFlowNodeDataSchema.safeParse({
    target_flow_id: "wf_target_123",
    target_flow_name: "Customer Support Flow",
    mode: "handoff",
  });
  assert(validHandoff.success, "gotoFlowNodeDataSchema accepts valid handoff payload");

  // 1b. Validate valid subflow data
  const validSubflow = gotoFlowNodeDataSchema.safeParse({
    target_flow_id: "wf_target_456",
    target_flow_name: "Feedback Subflow",
    mode: "subflow",
    entry_node_id: "node_ask_name",
  });
  assert(validSubflow.success, "gotoFlowNodeDataSchema accepts valid subflow payload with entry_node_id");

  // 1c. Invalid mode rejected
  const invalidMode = gotoFlowNodeDataSchema.safeParse({
    target_flow_id: "wf_123",
    mode: "invalid_mode",
  });
  assert(!invalidMode.success, "gotoFlowNodeDataSchema rejects invalid mode");

  // 1d. validateGraph: Sub-flow mode requires both 'completed' and 'error' ports
  const subflowGraphMissingPorts: WorkflowGraph = {
    nodes: [
      { id: "node_trigger", type: "trigger", position: { x: 0, y: 0 }, data: { keyword: "test" } },
      {
        id: "node_goto",
        type: "goto_flow",
        position: { x: 0, y: 100 },
        data: { target_flow_id: "wf_sub_1", mode: "subflow" },
      },
    ],
    edges: [
      { id: "e1", from: "node_trigger", to: "node_goto", port: "next" },
    ],
  };

  const missingPortErrors = validateGraph(subflowGraphMissingPorts);
  assert(
    missingPortErrors.errors.some((e) => e.includes('"completed"') && e.includes('port is not connected')),
    "Sub-flow missing 'completed' port reported as validation error"
  );
  assert(
    missingPortErrors.errors.some((e) => e.includes('"error"') && e.includes('port is not connected')),
    "Sub-flow missing 'error' port reported as validation error"
  );

  // 1e. validateGraph: Sub-flow with both ports connected succeeds
  const subflowGraphConnected: WorkflowGraph = {
    nodes: [
      { id: "node_trigger", type: "trigger", position: { x: 0, y: 0 }, data: { keyword: "test" } },
      {
        id: "node_goto",
        type: "goto_flow",
        position: { x: 0, y: 100 },
        data: { target_flow_id: "wf_sub_1", mode: "subflow" },
      },
      { id: "node_end_ok", type: "end", position: { x: -100, y: 200 }, data: { text: "Done" } },
      { id: "node_end_err", type: "end", position: { x: 100, y: 200 }, data: { text: "Error" } },
    ],
    edges: [
      { id: "e1", from: "node_trigger", to: "node_goto", port: "next" },
      { id: "e2", from: "node_goto", to: "node_end_ok", port: "completed" },
      { id: "e3", from: "node_goto", to: "node_end_err", port: "error" },
    ],
  };
  const subflowConnectedErrors = validateGraph(subflowGraphConnected);
  assert(subflowConnectedErrors.valid, "Sub-flow with both 'completed' and 'error' ports connected passes graph validation");

  // 1f. validateGraph: Handoff mode is a valid terminal node with no outgoing ports required
  const handoffGraph: WorkflowGraph = {
    nodes: [
      { id: "node_trigger", type: "trigger", position: { x: 0, y: 0 }, data: { keyword: "test" } },
      {
        id: "node_goto",
        type: "goto_flow",
        position: { x: 0, y: 100 },
        data: { target_flow_id: "wf_target_1", mode: "handoff" },
      },
    ],
    edges: [
      { id: "e1", from: "node_trigger", to: "node_goto", port: "next" },
    ],
  };
  const handoffErrors = validateGraph(handoffGraph);
  assert(handoffErrors.valid, "Handoff node acts as a valid terminal exit without requiring outgoing edges");

  console.log("\n=================================================");
  console.log("TEST 2: Cross-Flow Cycle Detection");
  console.log("=================================================");

  // Setup project map
  const createMockGraphWithGoto = (targetId: string, mode: "handoff" | "subflow" = "handoff"): WorkflowGraph => ({
    nodes: [
      { id: "trig", type: "trigger", position: { x: 0, y: 0 }, data: { keyword: "k" } },
      { id: "gt", type: "goto_flow", position: { x: 0, y: 100 }, data: { target_flow_id: targetId, mode } },
    ],
    edges: [{ id: "e1", from: "trig", to: "gt", port: "next" }],
  });

  const emptyGraph: WorkflowGraph = {
    nodes: [
      { id: "trig", type: "trigger", position: { x: 0, y: 0 }, data: { keyword: "k" } },
      { id: "end", type: "end", position: { x: 0, y: 100 }, data: { text: "End" } },
    ],
    edges: [{ id: "e1", from: "trig", to: "end", port: "next" }],
  };

  // 2a. Direct self-reference: Flow A targets Flow A
  const flowAMap = new Map<string, any>([
    ["flow_A", { id: "flow_A", name: "Flow A", status: "active", graph: emptyGraph }],
  ]);
  const selfRefRes = validateCrossFlowGraph("flow_A", createMockGraphWithGoto("flow_A"), flowAMap, false);
  assert(!selfRefRes.valid, "Direct self-reference A→A is rejected");
  assert(selfRefRes.errors.some((e) => e.includes("A→A cycle")), "Self-reference error message explicitly mentions cycle");

  // 2b. Mutual cycle: Flow A -> Flow B -> Flow A
  const flowBGraph = createMockGraphWithGoto("flow_A");
  const mutualCycleMap = new Map<string, any>([
    ["flow_A", { id: "flow_A", name: "Flow A", status: "active", graph: emptyGraph }],
    ["flow_B", { id: "flow_B", name: "Flow B", status: "active", graph: flowBGraph }],
  ]);
  const flowAGraphCallingB = createMockGraphWithGoto("flow_B");
  const mutualRes = validateCrossFlowGraph("flow_A", flowAGraphCallingB, mutualCycleMap, false);
  assert(!mutualRes.valid, "Mutual cycle A→B→A is rejected");
  assert(mutualRes.errors.some((e) => e.includes("cycle detected")), "Error identifies cycle between A and B");

  // 2c. Multi-step cycle: Flow A -> Flow B -> Flow C -> Flow A
  const flowCGraph = createMockGraphWithGoto("flow_A");
  const flowBGraphCallingC = createMockGraphWithGoto("flow_C");
  const threeCycleMap = new Map<string, any>([
    ["flow_A", { id: "flow_A", name: "Flow A", status: "active", graph: emptyGraph }],
    ["flow_B", { id: "flow_B", name: "Flow B", status: "active", graph: flowBGraphCallingC }],
    ["flow_C", { id: "flow_C", name: "Flow C", status: "active", graph: flowCGraph }],
  ]);
  const threeCycleRes = validateCrossFlowGraph("flow_A", flowAGraphCallingB, threeCycleMap, false);
  assert(!threeCycleRes.valid, "3-step cycle A→B→C→A is rejected");
  assert(threeCycleRes.errors.some((e) => e.includes("Flow A → Flow B → Flow C → Flow A")), "Cycle path is accurately traced in error message");

  // 2d. Valid DAG (no cycle): A -> B, A -> C, B -> D, C -> D
  const flowDGraph = emptyGraph;
  const flowBCallingD = createMockGraphWithGoto("flow_D");
  const flowCCallingD = createMockGraphWithGoto("flow_D");
  const dagMap = new Map<string, any>([
    ["flow_A", { id: "flow_A", name: "Flow A", status: "active", graph: emptyGraph }],
    ["flow_B", { id: "flow_B", name: "Flow B", status: "active", graph: flowBCallingD }],
    ["flow_C", { id: "flow_C", name: "Flow C", status: "active", graph: flowCCallingD }],
    ["flow_D", { id: "flow_D", name: "Flow D", status: "active", graph: flowDGraph }],
  ]);
  const dagGraphA: WorkflowGraph = {
    nodes: [
      { id: "trig", type: "trigger", position: { x: 0, y: 0 }, data: { keyword: "k" } },
      { id: "gt1", type: "goto_flow", position: { x: 0, y: 100 }, data: { target_flow_id: "flow_B", mode: "subflow" } },
      { id: "gt2", type: "goto_flow", position: { x: 100, y: 200 }, data: { target_flow_id: "flow_C", mode: "handoff" } },
      { id: "end", type: "end", position: { x: -100, y: 200 }, data: { text: "End" } },
    ],
    edges: [
      { id: "e1", from: "trig", to: "gt1", port: "next" },
      { id: "e2", from: "gt1", to: "gt2", port: "completed" },
      { id: "e3", from: "gt1", to: "end", port: "error" },
    ],
  };
  const dagRes = validateCrossFlowGraph("flow_A", dagGraphA, dagMap, false);
  assert(dagRes.valid, "Valid DAG structure with converging branches (A→B→D and A→C→D) passes cycle check");

  console.log("\n=================================================");
  console.log("TEST 3: Max Call Depth Enforcement");
  console.log("=================================================");

  // Create chain: F1 -> F2 -> F3 -> F4 -> F5 -> F6 (Depth 5 = 5 hops = 6 flows)
  const chainMap = new Map<string, any>([
    ["f1", { id: "f1", name: "Flow 1", status: "active", graph: emptyGraph }],
    ["f2", { id: "f2", name: "Flow 2", status: "active", graph: createMockGraphWithGoto("f3") }],
    ["f3", { id: "f3", name: "Flow 3", status: "active", graph: createMockGraphWithGoto("f4") }],
    ["f4", { id: "f4", name: "Flow 4", status: "active", graph: createMockGraphWithGoto("f5") }],
    ["f5", { id: "f5", name: "Flow 5", status: "active", graph: createMockGraphWithGoto("f6") }],
    ["f6", { id: "f6", name: "Flow 6", status: "active", graph: emptyGraph }],
  ]);

  const depth5Res = validateCrossFlowGraph("f1", createMockGraphWithGoto("f2"), chainMap, false);
  assert(depth5Res.valid, "Call chain of depth 5 (5 hops) is permitted within max depth limit");

  // Create chain of depth 6 (6 hops): F1 -> F2 -> F3 -> F4 -> F5 -> F6 -> F7
  chainMap.set("f6", { id: "f6", name: "Flow 6", status: "active", graph: createMockGraphWithGoto("f7") });
  chainMap.set("f7", { id: "f7", name: "Flow 7", status: "active", graph: emptyGraph });

  const depth6Res = validateCrossFlowGraph("f1", createMockGraphWithGoto("f2"), chainMap, false);
  assert(!depth6Res.valid, "Call chain exceeding depth 5 (found depth 6) is rejected");
  assert(depth6Res.errors.some((e) => e.includes("Maximum flow call depth of 5 exceeded")), "Error mentions max depth of 5 exceeded");

  console.log("\n=================================================");
  console.log("TEST 4: Publish-Time Status Rules");
  console.log("=================================================");

  const draftTargetMap = new Map<string, any>([
    ["flow_main", { id: "flow_main", name: "Main Flow", status: "draft", graph: emptyGraph }],
    ["flow_sub_draft", { id: "flow_sub_draft", name: "Subflow In Draft", status: "draft", graph: emptyGraph }],
  ]);

  const saveDraftRes = validateCrossFlowGraph(
    "flow_main",
    createMockGraphWithGoto("flow_sub_draft"),
    draftTargetMap,
    false // isPublishing = false
  );
  assert(saveDraftRes.valid, "Saving draft workflow with a draft target flow is permitted");

  const publishRes = validateCrossFlowGraph(
    "flow_main",
    createMockGraphWithGoto("flow_sub_draft"),
    draftTargetMap,
    true // isPublishing = true
  );
  assert(!publishRes.valid, "Publishing workflow with a draft target flow is rejected");
  assert(publishRes.errors.some((e) => e.includes("is currently a draft")), "Publish error specifies target flow is a draft");

  console.log("\n=================================================");
  console.log("TEST 5: Deletion Reference Integrity Check");
  console.log("=================================================");

  const projectMapWithRef = new Map<string, any>([
    ["flow_caller", { id: "flow_caller", name: "Main Ordering Flow", status: "active", graph: createMockGraphWithGoto("flow_target") }],
    ["flow_target", { id: "flow_target", name: "Order Processing Flow", status: "active", graph: emptyGraph }],
    ["flow_other", { id: "flow_other", name: "Unrelated Flow", status: "active", graph: emptyGraph }],
  ]);

  const refCheckBlocked = checkWorkflowReferencesFromMap("flow_target", projectMapWithRef);
  assert(refCheckBlocked.isReferenced, "Target flow is correctly detected as referenced");
  assert(
    refCheckBlocked.referencingFlows.some((f) => f.id === "flow_caller" && f.name === "Main Ordering Flow"),
    "Referencing flow name 'Main Ordering Flow' is listed"
  );

  const refCheckAllowed = checkWorkflowReferencesFromMap("flow_other", projectMapWithRef);
  assert(!refCheckAllowed.isReferenced, "Unreferenced flow is permitted to be deleted");
  assert(refCheckAllowed.referencingFlows.length === 0, "No referencing flows returned for unreferenced workflow");

  console.log("\n=================================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
  console.log("=================================================");
}

runTests().catch((err) => {
  console.error("Test failed with exception:", err);
  process.exit(1);
});
