import { WorkflowGraph, WorkflowNode, WorkflowEdge } from "./types";

/**
 * Generates a clean copy name for a cloned workflow.
 */
export function getClonedWorkflowName(originalName: string): string {
  const trimmed = originalName.trim();
  if (trimmed.endsWith("(copy)")) {
    return `${trimmed.slice(0, -6).trim()} (copy 2)`;
  }
  const copyMatch = trimmed.match(/^(.*?)\s*\(copy\s*(\d+)\)$/i);
  if (copyMatch) {
    const base = copyMatch[1].trim();
    const num = parseInt(copyMatch[2], 10) + 1;
    return `${base} (copy ${num})`;
  }
  return `${trimmed} (copy)`;
}

export interface CloneWorkflowResult {
  graph: WorkflowGraph;
  idMap: Map<string, string>;
}

/**
 * Deep clones a WorkflowGraph, regenerating unique node and edge IDs
 * while updating all edge references to maintain valid graph topology.
 */
export function cloneWorkflowGraph(sourceGraph: WorkflowGraph): CloneWorkflowResult {
  const idMap = new Map<string, string>();
  const clonedNodes: WorkflowNode[] = [];
  const clonedEdges: WorkflowEdge[] = [];

  const timestamp = Date.now();
  let counter = 1;

  // 1. Clone nodes and assign new unique IDs
  for (const node of sourceGraph.nodes || []) {
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const newNodeId = `node_${node.type}_${timestamp}_${counter}_${randomSuffix}`;
    counter++;
    idMap.set(node.id, newNodeId);

    // Deep clone data and position
    const clonedData = node.data ? JSON.parse(JSON.stringify(node.data)) : {};
    const clonedPosition = node.position ? { ...node.position } : undefined;

    clonedNodes.push({
      id: newNodeId,
      type: node.type,
      position: clonedPosition,
      data: clonedData,
    });
  }

  // 2. Clone edges and remap from and to endpoints
  let edgeCounter = 1;
  for (const edge of sourceGraph.edges || []) {
    const newFrom = idMap.get(edge.from) || edge.from;
    const newTo = idMap.get(edge.to) || edge.to;
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const newEdgeId = `edge_${timestamp}_${edgeCounter}_${randomSuffix}`;
    edgeCounter++;

    clonedEdges.push({
      id: newEdgeId,
      from: newFrom,
      port: edge.port,
      to: newTo,
    });
  }

  return {
    graph: {
      nodes: clonedNodes,
      edges: clonedEdges,
    },
    idMap,
  };
}
