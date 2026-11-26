import { executeQuery, sql } from "@/server/database/connection";
import { WorkflowGraph } from "./types";

export interface CrossFlowValidationResult {
  valid: boolean;
  errors: string[];
}

export interface WorkflowReferenceCheckResult {
  isReferenced: boolean;
  referencingFlows: Array<{ id: string; name: string }>;
}

/**
 * Validates cross-flow rules against a given map of project workflows:
 * 1. Target flow must exist in the same project
 * 2. Self-references (A→A) are rejected
 * 3. When publishing, target flow must be published ('active')
 * 4. Cross-flow cycles (e.g. A→B→A) are strictly rejected
 * 5. Maximum flow call depth cannot exceed 5
 */
export function validateCrossFlowGraph(
  currentFlowId: string,
  currentGraph: WorkflowGraph,
  projectFlowMap: Map<string, { id: string; name: string; status: string; graph: WorkflowGraph }>,
  isPublishing: boolean = false
): CrossFlowValidationResult {
  const errors: string[] = [];

  // Inspect all goto_flow nodes in currentGraph
  const gotoNodes = (currentGraph.nodes || []).filter((n) => n.type === "goto_flow");

  for (const node of gotoNodes) {
    const targetId = node.data?.target_flow_id;

    if (!targetId || !String(targetId).trim()) {
      errors.push(`Node "${node.id}" (Go to Flow): Target flow is required.`);
      continue;
    }

    // Reject self-reference
    if (targetId === currentFlowId) {
      errors.push(
        `Node "${node.id}" (Go to Flow): A flow cannot target itself directly (A→A cycle detected).`
      );
      continue;
    }

    const targetFlow = projectFlowMap.get(targetId);
    if (!targetFlow) {
      errors.push(
        `Node "${node.id}" (Go to Flow): Target flow "${targetId}" does not exist in this project.`
      );
      continue;
    }

    // Require target flow to be published if publishing current flow
    if (isPublishing && targetFlow.status !== "active") {
      errors.push(
        `Node "${node.id}" (Go to Flow): Target flow "${targetFlow.name}" is currently a draft. All target workflows must be published before this workflow can be published.`
      );
    }

    // Check optional entry node if provided
    const entryNodeId = node.data?.entry_node_id;
    if (entryNodeId && String(entryNodeId).trim()) {
      const targetNodes = targetFlow.graph?.nodes || [];
      const hasEntryNode = targetNodes.some((n) => n.id === entryNodeId);
      if (!hasEntryNode) {
        errors.push(
          `Node "${node.id}" (Go to Flow): Specified entry node "${entryNodeId}" not found in target flow "${targetFlow.name}".`
        );
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build Project-Wide Flow Call Adjacency Graph
  const flowCalls = new Map<string, Array<{ targetId: string; targetName: string; mode: string }>>();

  // Register current flow with the proposed currentGraph
  const currentTargetLinks: Array<{ targetId: string; targetName: string; mode: string }> = [];
  for (const gn of gotoNodes) {
    const tid = gn.data?.target_flow_id;
    if (tid && projectFlowMap.has(tid)) {
      currentTargetLinks.push({
        targetId: tid,
        targetName: projectFlowMap.get(tid)!.name,
        mode: gn.data?.mode || "handoff",
      });
    }
  }
  flowCalls.set(currentFlowId, currentTargetLinks);

  // Register all other flows from map
  for (const [fid, flowInfo] of projectFlowMap.entries()) {
    if (fid === currentFlowId) continue;
    const links: Array<{ targetId: string; targetName: string; mode: string }> = [];
    const fnodes = flowInfo.graph?.nodes || [];
    for (const fn of fnodes) {
      if (fn.type === "goto_flow" && fn.data?.target_flow_id) {
        const tid = fn.data.target_flow_id;
        if (projectFlowMap.has(tid)) {
          links.push({
            targetId: tid,
            targetName: projectFlowMap.get(tid)!.name,
            mode: fn.data?.mode || "handoff",
          });
        }
      }
    }
    flowCalls.set(fid, links);
  }

  // Cycle Detection (DFS)
  const currentFlowName = projectFlowMap.get(currentFlowId)?.name || "Current Flow";
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const pathStack: string[] = [];

  function dfsCycle(currId: string): boolean {
    visited.add(currId);
    recStack.add(currId);
    const flowName = currId === currentFlowId ? currentFlowName : (projectFlowMap.get(currId)?.name || currId);
    pathStack.push(flowName);

    const outgoing = flowCalls.get(currId) || [];
    for (const link of outgoing) {
      if (!visited.has(link.targetId)) {
        if (dfsCycle(link.targetId)) return true;
      } else if (recStack.has(link.targetId)) {
        const targetName = link.targetId === currentFlowId ? currentFlowName : (projectFlowMap.get(link.targetId)?.name || link.targetId);
        pathStack.push(targetName);
        return true; // Cycle detected
      }
    }

    pathStack.pop();
    recStack.delete(currId);
    return false;
  }

  if (dfsCycle(currentFlowId)) {
    const cycleStr = pathStack.join(" → ");
    errors.push(`Cross-flow cycle detected: ${cycleStr}. Infinite workflow loops are not permitted.`);
    return { valid: false, errors };
  }

  // Max Call Depth Enforcement (Max 5)
  let maxDepthFound = 1;
  let deepestPath: string[] = [];

  function dfsDepth(currId: string, currentPath: string[]) {
    if (currentPath.length > maxDepthFound) {
      maxDepthFound = currentPath.length;
      deepestPath = [...currentPath];
    }
    if (currentPath.length > 6) {
      return; // Stop exploring beyond limit
    }

    const outgoing = flowCalls.get(currId) || [];
    for (const link of outgoing) {
      if (!currentPath.includes(link.targetName)) {
        dfsDepth(link.targetId, [...currentPath, link.targetName]);
      }
    }
  }

  dfsDepth(currentFlowId, [currentFlowName]);

  const callHops = maxDepthFound - 1;
  if (callHops > 5) {
    errors.push(
      `Maximum flow call depth of 5 exceeded (found depth ${callHops}). Call path: ${deepestPath.join(" → ")}.`
    );
    return { valid: false, errors };
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates cross-flow rules when saving or publishing a workflow by querying MSSQL.
 */
export async function validateCrossFlows(
  projectId: string,
  currentFlowId: string,
  currentGraph: WorkflowGraph,
  isPublishing: boolean = false
): Promise<CrossFlowValidationResult> {
  let projectFlowRows: any[] = [];
  try {
    projectFlowRows = await executeQuery<any>(
      `SELECT id, name, status, version, graph_json
       FROM workflows
       WHERE project_id = @projectId AND status != 'archived'`,
      { projectId: { type: sql.NVarChar(64), value: projectId } }
    );
  } catch (err: any) {
    return { valid: false, errors: [`Database error while checking workflows: ${err.message}`] };
  }

  const projectFlowMap = new Map<string, { id: string; name: string; status: string; graph: WorkflowGraph }>();
  for (const row of projectFlowRows) {
    let g: WorkflowGraph = { nodes: [], edges: [] };
    try {
      g = typeof row.graph_json === "string" ? JSON.parse(row.graph_json) : row.graph_json;
    } catch {}
    projectFlowMap.set(row.id, {
      id: row.id,
      name: row.name,
      status: row.status,
      graph: g,
    });
  }

  return validateCrossFlowGraph(currentFlowId, currentGraph, projectFlowMap, isPublishing);
}

/**
 * Checks references against a project flow map.
 */
export function checkWorkflowReferencesFromMap(
  workflowId: string,
  projectFlowMap: Map<string, { id: string; name: string; status: string; graph: WorkflowGraph }>
): WorkflowReferenceCheckResult {
  const referencingFlows: Array<{ id: string; name: string }> = [];

  for (const [fid, flowInfo] of projectFlowMap.entries()) {
    if (fid === workflowId) continue;
    const hasRef = (flowInfo.graph?.nodes || []).some(
      (n) => n.type === "goto_flow" && n.data?.target_flow_id === workflowId
    );

    if (hasRef) {
      referencingFlows.push({
        id: flowInfo.id,
        name: flowInfo.name,
      });
    }
  }

  return {
    isReferenced: referencingFlows.length > 0,
    referencingFlows,
  };
}

/**
 * Checks if a workflow is referenced by other workflows in the same project.
 * Used to block deletion of referenced workflows.
 */
export async function checkWorkflowReferences(
  projectId: string,
  workflowId: string
): Promise<WorkflowReferenceCheckResult> {
  let projectFlowRows: any[] = [];
  try {
    projectFlowRows = await executeQuery<any>(
      `SELECT id, name, graph_json
       FROM workflows
       WHERE project_id = @projectId AND id != @targetId AND status != 'archived'`,
      {
        projectId: { type: sql.NVarChar(64), value: projectId },
        targetId: { type: sql.NVarChar(64), value: workflowId },
      }
    );
  } catch (err: any) {
    throw new Error(`Failed to check workflow references: ${err.message}`);
  }

  const referencingFlows: Array<{ id: string; name: string }> = [];

  for (const row of projectFlowRows) {
    let graph: WorkflowGraph = { nodes: [], edges: [] };
    try {
      graph = typeof row.graph_json === "string" ? JSON.parse(row.graph_json) : row.graph_json;
    } catch {
      continue;
    }

    const hasRef = (graph.nodes || []).some(
      (n) => n.type === "goto_flow" && n.data?.target_flow_id === workflowId
    );

    if (hasRef) {
      referencingFlows.push({
        id: row.id,
        name: row.name,
      });
    }
  }

  return {
    isReferenced: referencingFlows.length > 0,
    referencingFlows,
  };
}
