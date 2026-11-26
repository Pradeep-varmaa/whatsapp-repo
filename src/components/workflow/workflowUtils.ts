import { Node, Edge } from "@xyflow/react";
import { NodeType, WorkflowGraph } from "@/server/workflows/types";
import { validateGraph } from "@/server/workflows/validation";

export interface ExecutionStepInfo {
  node: Node;
  stepNumber: number;
  title: string;
  subtitle: string;
  hasError: boolean;
  errorMessages: string[];
}

/**
 * Node color accents matching the editor theme.
 */
export const NODE_TYPE_COLORS: Record<string, { bg: string; dot: string; text: string; lightBg: string }> = {
  trigger: { bg: "#fef3c7", dot: "#f59e0b", text: "#92400e", lightBg: "#fffbeb" },
  message: { bg: "#f5f3ff", dot: "#7c3aed", text: "#5b21b6", lightBg: "#faf5ff" },
  buttons: { bg: "#f5f3ff", dot: "#8b5cf6", text: "#6b21a8", lightBg: "#faf5ff" },
  list: { bg: "#f0f9ff", dot: "#0284c7", text: "#0369a1", lightBg: "#f0f9ff" },
  ask: { bg: "#eff6ff", dot: "#2563eb", text: "#1e40af", lightBg: "#eff6ff" },
  api: { bg: "#ecfdf5", dot: "#059669", text: "#065f46", lightBg: "#ecfdf5" },
  condition: { bg: "#fffbeb", dot: "#d97706", text: "#92400e", lightBg: "#fffbeb" },
  goto_flow: { bg: "#eef2ff", dot: "#6366f1", text: "#4338ca", lightBg: "#eef2ff" },
  calculation: { bg: "#f0fdf4", dot: "#16a34a", text: "#15803d", lightBg: "#f0fdf4" },
  end: { bg: "#fef2f2", dot: "#dc2626", text: "#991b1b", lightBg: "#fef2f2" },
};

export const STEP_TYPE_PRESETS: {
  type: NodeType;
  name: string;
  subtitle: string;
  color: string;
  bg: string;
  customData?: Record<string, any>;
}[] = [
  {
    type: "message",
    name: "Message",
    subtitle: "Send a WhatsApp text message",
    color: "#7c3aed",
    bg: "#f5f3ff",
    customData: { text: "Hello! How can we help you?" },
  },
  {
    type: "buttons",
    name: "Quick Buttons",
    subtitle: "Up to 3 quick reply options",
    color: "#8b5cf6",
    bg: "#f5f3ff",
    customData: {
      text: "Please choose an option:",
      opts: [
        { id: `btn_${Date.now()}_1`, title: "Option 1" },
        { id: `btn_${Date.now()}_2`, title: "Option 2" },
      ],
    },
  },
  {
    type: "buttons",
    name: "Review & Confirm",
    subtitle: "Plain text details with Proceed or Cancel",
    color: "#0891b2",
    bg: "#ecfeff",
    customData: {
      text: "Please review your submitted request details:\n\n• Name: {{customer_name}}\n• Details: {{customer_input}}\n• Date/Time: {{selected_date}} at {{selected_time}}\n\nSelect an option below to proceed or cancel:",
      opts: [
        { id: "btn_proceed", title: "Proceed" },
        { id: "btn_cancel", title: "Cancel" },
      ],
    },
  },
  {
    type: "list",
    name: "Menu List",
    subtitle: "Interactive list menu (up to 10 items)",
    color: "#0284c7",
    bg: "#f0f9ff",
    customData: {
      text: "Select from the list below:",
      buttonText: "View Options",
      opts: [
        { id: `row_${Date.now()}_1`, title: "First Option", description: "" },
        { id: `row_${Date.now()}_2`, title: "Second Option", description: "" },
      ],
    },
  },
  {
    type: "ask",
    name: "Ask Question",
    subtitle: "Prompt customer and save to variable",
    color: "#2563eb",
    bg: "#eff6ff",
    customData: {
      text: "Please provide your details:",
      var: "customer_input",
      kind: "text",
    },
  },
  {
    type: "ask",
    name: "Date Picker",
    subtitle: "Calendar date selector component",
    color: "#0f766e",
    bg: "#f0fdfa",
    customData: {
      text: "Please select your convenient date:",
      var: "selected_date",
      kind: "date",
    },
  },
  {
    type: "ask",
    name: "Time Picker",
    subtitle: "Time slot selection component",
    color: "#0284c7",
    bg: "#f0f9ff",
    customData: {
      text: "Please select your preferred time slot:",
      var: "selected_time",
      kind: "time",
    },
  },
  {
    type: "api",
    name: "Server API",
    subtitle: "Trigger external HTTP API or webhook",
    color: "#059669",
    bg: "#ecfdf5",
    customData: {
      method: "GET",
      url: "https://api.example.com/data",
      save: "api_result",
    },
  },
  {
    type: "goto_flow",
    name: "Go to Flow",
    subtitle: "Handoff or run sub-flow and return",
    color: "#6366f1",
    bg: "#eef2ff",
    customData: {
      mode: "handoff",
      target_flow_id: "",
      target_flow_name: "",
    },
  },
  {
    type: "calculation",
    name: "Calculation / Math",
    subtitle: "Compute totals, add numbers, or percentages",
    color: "#16a34a",
    bg: "#f0fdf4",
    customData: {
      operation: "add",
      operand_a: "{{num1}}",
      operand_b: "{{num2}}",
      save_to: "total_amount",
      round_decimals: 2,
      label: "Calculate Total",
    },
  },
  {
    type: "calculation",
    name: "Date Difference",
    subtitle: "Calculate days or hours between 2 dates",
    color: "#059669",
    bg: "#ecfdf5",
    customData: {
      operation: "date_diff_days",
      operand_a: "{{checkin_date}}",
      operand_b: "{{checkout_date}}",
      save_to: "stay_days",
      label: "Days Difference",
    },
  },
  {
    type: "end",
    name: "End Flow",
    subtitle: "Conclude conversation session",
    color: "#dc2626",
    bg: "#fef2f2",
    customData: {
      text: "Thank you for reaching out!",
    },
  },
];

/**
 * Extracts a human-friendly name for a node type.
 */
export function getNodeTypeName(type: string, data?: any): string {
  if (type === "trigger") return "Trigger";
  if (type === "message") return "Message";
  if (type === "buttons") return "Quick Buttons";
  if (type === "list") return "List Menu";
  if (type === "ask") {
    if (data?.kind === "date") return "Ask Question · date";
    if (data?.kind === "time") return "Ask Question · time";
    return "Ask Question";
  }
  if (type === "api") return "Server API";
  if (type === "condition") return "Condition";
  if (type === "calculation") return data?.label || "Calculation";
  if (type === "goto_flow") {
    const mode = data?.mode === "subflow" ? "Sub-flow" : "Handoff";
    return `Go to Flow · ${mode}`;
  }
  if (type === "end") return "End Flow";
  return type;
}

/**
 * Extracts a concise subtitle for a step.
 */
export function getNodeSubtitle(node: Node): string {
  const data = node.data || {};
  switch (node.type) {
    case "trigger":
      return data.keyword ? `Keyword: ${data.keyword}` : "Any message";
    case "message":
      return typeof data.text === "string" && data.text.trim()
        ? data.text.trim().slice(0, 36)
        : "Message text";
    case "buttons":
      return typeof data.text === "string" && data.text.trim()
        ? data.text.trim().slice(0, 36)
        : "Choose an option";
    case "list":
      return typeof data.text === "string" && data.text.trim()
        ? data.text.trim().slice(0, 36)
        : "List menu selection";
    case "ask":
      return data.kind ? `${data.kind} → ${data.var || "input"}` : "Collect response";
    case "api":
      return `${data.method || "GET"} ${typeof data.url === "string" ? data.url.replace(/^https?:\/\//, "").slice(0, 24) : ""}`;
    case "condition":
      return `If ${data.variable || "var"} ${data.operator || "equals"}`;
    case "goto_flow":
      return data.target_flow_name
        ? `${data.mode === "subflow" ? "Sub-flow" : "Handoff"}: ${String(data.target_flow_name).slice(0, 24)}`
        : (data.target_flow_id ? `${data.mode === "subflow" ? "Sub-flow" : "Handoff"}: ${String(data.target_flow_id).slice(0, 18)}` : "Select target flow");
    case "end":
      return typeof data.text === "string" && data.text.trim()
        ? data.text.trim().slice(0, 32)
        : "Session finished";
    default:
      return "";
  }
}

/**
 * Computes execution ordering via BFS from the trigger node.
 */
export function computeExecutionOrder(nodes: Node[], edges: Edge[]): ExecutionStepInfo[] {
  // Validate entire graph to identify nodes with errors
  const graph: WorkflowGraph = {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type as NodeType,
      position: n.position,
      data: n.data,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      from: e.source,
      port: (e.sourceHandle as string) || "next",
      to: e.target,
    })),
  };

  const validation = validateGraph(graph);
  const errorMap: Record<string, string[]> = {};

  for (const err of validation.errors) {
    const match = err.match(/Node "([^"]+)"/);
    if (match) {
      const nodeId = match[1];
      if (!errorMap[nodeId]) errorMap[nodeId] = [];
      errorMap[nodeId].push(err);
    }
  }

  const triggerNode = nodes.find((n) => n.type === "trigger") || nodes[0];
  const orderedNodes: Node[] = [];
  const visited = new Set<string>();

  if (triggerNode) {
    const queue: string[] = [triggerNode.id];
    visited.add(triggerNode.id);

    while (queue.length > 0) {
      const currId = queue.shift()!;
      const node = nodes.find((n) => n.id === currId);
      if (node) {
        orderedNodes.push(node);
      }

      // Find all outgoing edges from current node
      const outgoing = edges.filter((e) => e.source === currId);
      for (const edge of outgoing) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
  }

  // Any nodes not reached in BFS (orphans / disconnected)
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      visited.add(node.id);
      orderedNodes.push(node);
    }
  }

  return orderedNodes.map((node, index) => {
    const nodeErrors = errorMap[node.id] || [];
    return {
      node,
      stepNumber: index + 1,
      title: getNodeTypeName(node.type || "", node.data),
      subtitle: getNodeSubtitle(node),
      hasError: nodeErrors.length > 0,
      errorMessages: nodeErrors,
    };
  });
}

/**
 * Top-to-bottom hierarchical layout algorithm with branch offsets.
 * Guarantees no overlapping nodes and clean vertical alignment.
 */
export function autoLayoutWorkflow(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return [];

  const trigger = nodes.find((n) => n.type === "trigger") || nodes[0];
  const positioned = new Map<string, { x: number; y: number }>();

  // Map each depth/layer to how many columns are occupied
  const layerColumns: Record<number, number> = {};
  const visited = new Set<string>();

  function traverse(nodeId: string, depth: number, preferredCol: number) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    if (layerColumns[depth] === undefined) {
      layerColumns[depth] = 0;
    }

    const col = Math.max(preferredCol, layerColumns[depth]);
    layerColumns[depth] = col + 1;

    const startX = 350;
    const colWidth = 280;
    const rowHeight = 150;
    const startY = 60;

    positioned.set(nodeId, {
      x: startX + col * colWidth,
      y: startY + depth * rowHeight,
    });

    // Outgoing edges
    const outgoing = edges.filter((e) => e.source === nodeId);
    outgoing.forEach((edge, idx) => {
      // First child stays in same column; subsequent children branch to the right
      const nextCol = idx === 0 ? col : col + idx;
      traverse(edge.target, depth + 1, nextCol);
    });
  }

  if (trigger) {
    traverse(trigger.id, 0, 0);
  }

  // Position any unvisited nodes at the bottom
  const maxDepth = Object.keys(layerColumns).length;
  let orphanIndex = 0;
  for (const node of nodes) {
    if (!positioned.has(node.id)) {
      positioned.set(node.id, {
        x: 350 + (orphanIndex % 3) * 280,
        y: 60 + (maxDepth + Math.floor(orphanIndex / 3) + 1) * 150,
      });
      orphanIndex++;
    }
  }

  return nodes.map((node) => ({
    ...node,
    position: positioned.get(node.id) || node.position,
  }));
}

/**
 * Slices a new node into an existing edge:
 * source -> newNode -> target
 * Preserves the original edge's sourceHandle.
 */
export function insertNodeIntoEdge(
  nodes: Node[],
  edges: Edge[],
  edgeId: string,
  type: NodeType,
  customData?: Record<string, any>
): { newNodes: Node[]; newEdges: Edge[]; newNodeId: string } {
  const edge = edges.find((e) => e.id === edgeId);
  if (!edge) {
    throw new Error(`Edge with id "${edgeId}" not found`);
  }

  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);

  const newNodeId = `node_${type}_${Date.now().toString().slice(-4)}_${Math.random().toString(36).substring(2, 6)}`;

  // Default coordinates midpoint
  const posX = sourceNode && targetNode
    ? Math.round((sourceNode.position.x + targetNode.position.x) / 2)
    : 350;
  const posY = sourceNode && targetNode
    ? Math.round((sourceNode.position.y + targetNode.position.y) / 2)
    : 200;

  let defaultData: Record<string, any> = {};
  const preset = STEP_TYPE_PRESETS.find((p) => p.type === type);
  if (preset?.customData) {
    defaultData = JSON.parse(JSON.stringify(preset.customData));
  }
  if (customData) {
    defaultData = { ...defaultData, ...customData };
  }

  const newNode: Node = {
    id: newNodeId,
    type,
    position: { x: posX, y: posY },
    data: defaultData,
  };

  // Rewire edges:
  // Edge 1: source -> newNode (preserves edge.sourceHandle!)
  const edge1: Edge = {
    id: `e_${edge.source}_${edge.sourceHandle || "next"}_${newNodeId}_${Date.now().toString().slice(-4)}`,
    source: edge.source,
    sourceHandle: edge.sourceHandle || "next",
    target: newNodeId,
    type: "stepAddEdge",
    animated: true,
    style: { stroke: "#10b981", strokeWidth: 2 },
  };

  // Edge 2: newNode -> target
  // If newNode has options, default to "next" or first option id
  let outHandle = "next";
  if (type === "buttons" && Array.isArray(defaultData.opts) && defaultData.opts.length > 0) {
    outHandle = defaultData.opts[0].id;
  } else if (type === "list" && Array.isArray(defaultData.opts) && defaultData.opts.length > 0) {
    outHandle = defaultData.opts[0].id;
  }

  const edge2: Edge = {
    id: `e_${newNodeId}_${outHandle}_${edge.target}_${Date.now().toString().slice(-4)}`,
    source: newNodeId,
    sourceHandle: outHandle,
    target: edge.target,
    type: "stepAddEdge",
    animated: true,
    style: { stroke: "#10b981", strokeWidth: 2 },
  };

  const remainingEdges = edges.filter((e) => e.id !== edgeId);
  const newEdges = [...remainingEdges, edge1, edge2];
  const newNodes = [...nodes, newNode];

  return {
    newNodes,
    newEdges,
    newNodeId,
  };
}

/**
 * Appends a new node after a tail node:
 * tailNode -> newNode
 */
export function appendNodeAfter(
  nodes: Node[],
  edges: Edge[],
  sourceNodeId: string,
  type: NodeType,
  customData?: Record<string, any>,
  preferredHandle?: string
): { newNodes: Node[]; newEdges: Edge[]; newNodeId: string } {
  const sourceNode = nodes.find((n) => n.id === sourceNodeId);
  if (!sourceNode) {
    throw new Error(`Source node with id "${sourceNodeId}" not found`);
  }

  const newNodeId = `node_${type}_${Date.now().toString().slice(-4)}_${Math.random().toString(36).substring(2, 6)}`;
  const posX = sourceNode.position.x;
  const posY = sourceNode.position.y + 160;

  let defaultData: Record<string, any> = {};
  const preset = STEP_TYPE_PRESETS.find((p) => p.type === type);
  if (preset?.customData) {
    defaultData = JSON.parse(JSON.stringify(preset.customData));
  }
  if (customData) {
    defaultData = { ...defaultData, ...customData };
  }

  const newNode: Node = {
    id: newNodeId,
    type,
    position: { x: posX, y: posY },
    data: defaultData,
  };

  let port = preferredHandle || "next";
  if (!preferredHandle) {
    // If buttons or list, check if any option is unlinked
    if (sourceNode.type === "buttons" && Array.isArray(sourceNode.data?.opts)) {
      const linkedPorts = new Set(edges.filter((e) => e.source === sourceNodeId).map((e) => e.sourceHandle));
      const unlinked = sourceNode.data.opts.find((opt: any) => !linkedPorts.has(opt.id));
      if (unlinked) port = unlinked.id;
    } else if (sourceNode.type === "list" && Array.isArray(sourceNode.data?.opts)) {
      const linkedPorts = new Set(edges.filter((e) => e.source === sourceNodeId).map((e) => e.sourceHandle));
      const unlinked = sourceNode.data.opts.find((opt: any) => !linkedPorts.has(opt.id));
      if (unlinked) port = unlinked.id;
    }
  }

  const newEdge: Edge = {
    id: `e_${sourceNodeId}_${port}_${newNodeId}_${Date.now().toString().slice(-4)}`,
    source: sourceNodeId,
    sourceHandle: port,
    target: newNodeId,
    type: "stepAddEdge",
    animated: true,
    style: { stroke: "#10b981", strokeWidth: 2 },
  };

  return {
    newNodes: [...nodes, newNode],
    newEdges: [...edges, newEdge],
    newNodeId,
  };
}

/**
 * Deletes a node and auto-reconnects when exactly 1 incoming and 1 outgoing edge exist.
 * The Trigger node cannot be deleted.
 */
export function deleteNodeAndReconnect(
  nodes: Node[],
  edges: Edge[],
  nodeId: string
): {
  success: boolean;
  reconnected: boolean;
  requiresConfirm: boolean;
  error?: string;
  newNodes: Node[];
  newEdges: Edge[];
} {
  const targetNode = nodes.find((n) => n.id === nodeId);
  if (!targetNode) {
    return { success: false, reconnected: false, requiresConfirm: false, error: "Node not found", newNodes: nodes, newEdges: edges };
  }

  if (targetNode.type === "trigger") {
    return {
      success: false,
      reconnected: false,
      requiresConfirm: false,
      error: "The Trigger node cannot be deleted.",
      newNodes: nodes,
      newEdges: edges,
    };
  }

  const incoming = edges.filter((e) => e.target === nodeId);
  const outgoing = edges.filter((e) => e.source === nodeId);

  // Exactly 1 incoming and 1 outgoing: auto-reconnect
  if (incoming.length === 1 && outgoing.length === 1) {
    const inEdge = incoming[0];
    const outEdge = outgoing[0];

    const reconnectedEdge: Edge = {
      id: `e_${inEdge.source}_${inEdge.sourceHandle || "next"}_${outEdge.target}_${Date.now().toString().slice(-4)}`,
      source: inEdge.source,
      sourceHandle: inEdge.sourceHandle || "next",
      target: outEdge.target,
      type: "stepAddEdge",
      animated: true,
      style: { stroke: "#10b981", strokeWidth: 2 },
    };

    const remainingEdges = edges.filter((e) => e.id !== inEdge.id && e.id !== outEdge.id);
    return {
      success: true,
      reconnected: true,
      requiresConfirm: false,
      newNodes: nodes.filter((n) => n.id !== nodeId),
      newEdges: [...remainingEdges, reconnectedEdge],
    };
  }

  // Branching or orphan: requires confirmation
  return {
    success: true,
    reconnected: false,
    requiresConfirm: incoming.length > 1 || outgoing.length > 1,
    newNodes: nodes.filter((n) => n.id !== nodeId),
    newEdges: edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
  };
}
