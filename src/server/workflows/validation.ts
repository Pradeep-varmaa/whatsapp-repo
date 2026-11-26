import { z } from "zod";
import { GraphValidationResult, WorkflowGraph, ASK_KINDS, ASK_VALIDATION_KINDS, CONDITION_OPERATORS, CALCULATION_OPERATIONS } from "./types";

// -------------------------------------------------------------
// Zod Schemas for Node Payloads
// -------------------------------------------------------------

export const buttonOptionSchema = z.object({
  id: z.string().min(1, "Button ID is required"),
  title: z
    .string()
    .min(1, "Button title is required")
    .max(20, "Button title cannot exceed 20 characters (Meta limit)"),
});

export const listOptionSchema = z.object({
  id: z.string().min(1, "Option ID is required"),
  title: z
    .string()
    .min(1, "Option title is required")
    .max(24, "Option title cannot exceed 24 characters (Meta limit)"),
  description: z
    .string()
    .max(72, "Description cannot exceed 72 characters")
    .optional(),
});

export const triggerNodeDataSchema = z.object({
  keyword: z.string().optional(),
  description: z.string().optional(),
});

export const messageNodeDataSchema = z.object({
  text: z.string().min(1, "Message text cannot be empty"),
});

export const buttonsNodeDataSchema = z.object({
  text: z.string().min(1, "Message text is required for button menu"),
  opts: z
    .array(buttonOptionSchema)
    .min(1, "At least 1 button option is required")
    .max(3, "Maximum 3 button options allowed by Meta"),
});

export const listNodeDataSchema = z
  .object({
    text: z.string().min(1, "Message text is required for list menu"),
    buttonText: z.string().max(20).optional(),
    opts: z.array(listOptionSchema).optional(),
    is_dynamic: z.boolean().optional(),
    dynamicRows: z.boolean().optional(),
    array_path: z.string().optional(),
    title_field: z.string().optional(),
    description_field: z.string().optional(),
    id_field: z.string().optional(),
    empty_fallback_text: z.string().optional(),
    empty_message: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const isDynamic = Boolean(data.is_dynamic || data.dynamicRows);
    if (isDynamic) {
      if (!data.array_path || !data.array_path.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Context array path is required for dynamic list menu (e.g. {{api_result.response}})",
          path: ["array_path"],
        });
      }
    } else {
      if (!data.opts || data.opts.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least 1 list option is required",
          path: ["opts"],
        });
      } else if (data.opts.length > 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Maximum 10 list options allowed by Meta",
          path: ["opts"],
        });
      }
    }
  });

export const askNodeDataSchema = z.object({
  text: z.string().min(1, "Question prompt cannot be empty"),
  var: z
    .string()
    .min(1, "Variable name is required")
    .regex(
      /^[a-zA-Z_][a-zA-Z0-9_]*$/,
      "Variable name must be alphanumeric identifier (e.g. customer_name, order_id)"
    ),
  kind: z.enum(ASK_VALIDATION_KINDS, {
    message: `Invalid option: expected one of ${ASK_VALIDATION_KINDS.map((k) => `"${k}"`).join("|")}`,
  }),
});

export const apiFieldMappingSchema = z.object({
  from: z.string().min(1, "Source field path is required"),
  to: z
    .string()
    .min(1, "Target variable is required")
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Variable name must be alphanumeric"),
});

export const apiNodeDataSchema = z.object({
  url: z.string().url("Valid HTTP/HTTPS URL is required"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  authorization: z.string().optional(),
  contentType: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  save: z
    .string()
    .regex(
      /^[a-zA-Z_][a-zA-Z0-9_]*$/,
      "Save variable name must be alphanumeric identifier"
    )
    .optional(),
  mappings: z.array(apiFieldMappingSchema).optional(),
});

export const endNodeDataSchema = z.object({
  text: z.string().optional(),
});

export const conditionNodeDataSchema = z.object({
  variable: z.string().min(1, "Variable to evaluate is required"),
  operator: z.enum(CONDITION_OPERATORS, {
    message: `Invalid operator: expected one of ${CONDITION_OPERATORS.map((op) => `"${op}"`).join("|")}`,
  }),
  value: z.string().optional(),
  label: z.string().optional(),
});

export const gotoFlowNodeDataSchema = z.object({
  target_flow_id: z.string().min(1, "Target flow is required"),
  target_flow_name: z.string().optional(),
  mode: z.enum(["handoff", "subflow", "sub_flow"], {
    message: 'Invalid mode: expected "handoff" or "subflow"',
  }),
  entry_node_id: z.string().optional().nullable(),
});

export const calculationNodeDataSchema = z.object({
  operation: z.enum(CALCULATION_OPERATIONS, {
    message: `Invalid operation: expected one of ${CALCULATION_OPERATIONS.map((op) => `"${op}"`).join("|")}`,
  }),
  operand_a: z.string().optional(),
  operand_b: z.string().optional(),
  formula: z.string().optional(),
  save_to: z
    .string()
    .min(1, "Target variable name is required")
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Variable name must be alphanumeric"),
  round_decimals: z.number().int().min(0).max(10).optional(),
  label: z.string().optional(),
});

export const workflowNodeSchema = z.object({
  id: z.string().min(1, "Node id is required"),
  type: z.enum(["trigger", "message", "buttons", "list", "ask", "api", "condition", "calculation", "end", "goto_flow"]),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  data: z.record(z.string(), z.any()),
});

export const workflowEdgeSchema = z.object({
  id: z.string().optional(),
  from: z.string().min(1, "Source node is required"),
  port: z.string().min(1, "Port identifier is required"),
  to: z.string().min(1, "Target node is required"),
});

export const workflowGraphSchema = z.object({
  nodes: z.array(workflowNodeSchema).min(1, "Workflow must have at least one node"),
  edges: z.array(workflowEdgeSchema),
});

// -------------------------------------------------------------
// Semantic & Structural Graph Validator
// -------------------------------------------------------------

export function validateGraph(graph: WorkflowGraph): GraphValidationResult {
  const errors: string[] = [];

  // 1. Zod structural check
  const parsed = workflowGraphSchema.safeParse(graph);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
    return { valid: false, errors };
  }

  const nodes = graph.nodes;
  const edges = graph.edges;
  const nodeMap = new Map<string, (typeof nodes)[0]>();

  for (const n of nodes) {
    if (nodeMap.has(n.id)) {
      errors.push(`Duplicate node id detected: "${n.id}"`);
    }
    nodeMap.set(n.id, n);
  }

  // 2. Exactly one trigger node
  const triggers = nodes.filter((n) => n.type === "trigger");
  if (triggers.length === 0) {
    errors.push("Workflow must contain exactly one Trigger node (found 0).");
  } else if (triggers.length > 1) {
    errors.push(`Workflow must contain exactly one Trigger node (found ${triggers.length}).`);
  }

  const triggerNode = triggers[0];

  // 3. Validate each node's type-specific constraints
  for (const node of nodes) {
    const data = node.data || {};
    switch (node.type) {
      case "message": {
        const res = messageNodeDataSchema.safeParse(data);
        if (!res.success) {
          errors.push(`Node "${node.id}" (message): ${res.error.issues.map((i) => i.message).join(", ")}`);
        }
        break;
      }
      case "buttons": {
        const res = buttonsNodeDataSchema.safeParse(data);
        if (!res.success) {
          errors.push(`Node "${node.id}" (buttons): ${res.error.issues.map((i) => i.message).join(", ")}`);
        }
        break;
      }
      case "list": {
        const res = listNodeDataSchema.safeParse(data);
        if (!res.success) {
          errors.push(`Node "${node.id}" (list): ${res.error.issues.map((i) => i.message).join(", ")}`);
        }
        break;
      }
      case "ask": {
        const res = askNodeDataSchema.safeParse(data);
        if (!res.success) {
          errors.push(`Node "${node.id}" (ask): ${res.error.issues.map((i) => i.message).join(", ")}`);
        }
        break;
      }
      case "api": {
        const res = apiNodeDataSchema.safeParse(data);
        if (!res.success) {
          errors.push(`Node "${node.id}" (api): ${res.error.issues.map((i) => i.message).join(", ")}`);
        }
        break;
      }
      case "condition": {
        const res = conditionNodeDataSchema.safeParse(data);
        if (!res.success) {
          errors.push(`Node "${node.id}" (condition): ${res.error.issues.map((i) => i.message).join(", ")}`);
        }
        break;
      }
      case "end": {
        const res = endNodeDataSchema.safeParse(data);
        if (!res.success) {
          errors.push(`Node "${node.id}" (end): ${res.error.issues.map((i) => i.message).join(", ")}`);
        }
        break;
      }
      case "goto_flow": {
        const res = gotoFlowNodeDataSchema.safeParse(data);
        if (!res.success) {
          errors.push(`Node "${node.id}" (goto_flow): ${res.error.issues.map((i) => i.message).join(", ")}`);
        }
        break;
      }
      case "calculation": {
        const res = calculationNodeDataSchema.safeParse(data);
        if (!res.success) {
          errors.push(`Node "${node.id}" (calculation): ${res.error.issues.map((i) => i.message).join(", ")}`);
        }
        break;
      }
    }
  }

  // 4. Port connectivity checks: every non-end port must be connected
  // Group outgoing edges by source node id and port
  const outgoingByNode = new Map<string, Map<string, string>>();
  for (const edge of edges) {
    if (!nodeMap.has(edge.from)) {
      errors.push(`Edge connects from non-existent node "${edge.from}".`);
      continue;
    }
    if (!nodeMap.has(edge.to)) {
      errors.push(`Edge connects to non-existent node "${edge.to}".`);
      continue;
    }

    if (!outgoingByNode.has(edge.from)) {
      outgoingByNode.set(edge.from, new Map());
    }
    const portMap = outgoingByNode.get(edge.from)!;
    if (portMap.has(edge.port)) {
      errors.push(`Node "${edge.from}" has multiple edges on port "${edge.port}". Only one edge per port allowed.`);
    }
    portMap.set(edge.port, edge.to);
  }

  for (const node of nodes) {
    const isHandoffGoto = node.type === "goto_flow" && String(node.data?.mode || "handoff").toLowerCase() === "handoff";
    if (node.type === "end" || isHandoffGoto) continue;

    const ports = outgoingByNode.get(node.id) || new Map();

    if (node.type === "buttons") {
      const opts = (node.data?.opts as Array<{ id: string }>) || [];
      for (const opt of opts) {
        if (!ports.has(opt.id)) {
          errors.push(`Node "${node.id}" (buttons): option "${opt.id}" port is not connected.`);
        }
      }
    } else if (node.type === "list") {
      const isDynamic = Boolean(node.data?.is_dynamic || node.data?.dynamicRows);
      if (isDynamic) {
        // Dynamic list: rows are populated from API context array at runtime.
        // It requires a single "next" (or "reply"/"default" or any outgoing edge) to the next node.
        const hasOutgoing = ports.has("next") || ports.has("reply") || ports.has("default") || ports.size > 0;
        if (!hasOutgoing) {
          errors.push(`Node "${node.id}" (list): "next" port is not connected.`);
        }
      } else {
        const opts = (node.data?.opts as Array<{ id: string }>) || [];
        for (const opt of opts) {
          if (!ports.has(opt.id)) {
            errors.push(`Node "${node.id}" (list): option "${opt.id}" port is not connected.`);
          }
        }
      }
    } else if (node.type === "api") {
      if (!ports.has("success")) {
        errors.push(`Node "${node.id}" (api): "success" output port is not connected.`);
      }
      if (!ports.has("error")) {
        errors.push(`Node "${node.id}" (api): "error" output port is not connected.`);
      }
    } else if (node.type === "condition") {
      if (!ports.has("true")) {
        errors.push(`Node "${node.id}" (condition): "true" (Yes / Match) output port is not connected.`);
      }
      if (!ports.has("false")) {
        errors.push(`Node "${node.id}" (condition): "false" (No / Else) output port is not connected.`);
      }
    } else if (node.type === "goto_flow") {
      const mode = String(node.data?.mode || "handoff").toLowerCase();
      if (mode === "subflow" || mode === "sub_flow") {
        if (!ports.has("completed")) {
          errors.push(`Node "${node.id}" (goto_flow): "completed" output port is not connected.`);
        }
        if (!ports.has("error")) {
          errors.push(`Node "${node.id}" (goto_flow): "error" output port is not connected.`);
        }
      }
    } else {
      // trigger, message, ask: expect "next" port
      if (!ports.has("next")) {
        errors.push(`Node "${node.id}" (${node.type}): "next" port is not connected.`);
      }
    }
  }

  // 5. Reachability: all nodes must be reachable from the Trigger node (no orphan nodes)
  if (triggerNode) {
    const reachable = new Set<string>();
    const queue: string[] = [triggerNode.id];
    reachable.add(triggerNode.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const portMap = outgoingByNode.get(current);
      if (portMap) {
        for (const targetId of portMap.values()) {
          if (!reachable.has(targetId)) {
            reachable.add(targetId);
            queue.push(targetId);
          }
        }
      }
    }

    for (const node of nodes) {
      if (!reachable.has(node.id)) {
        errors.push(`Orphan node detected: Node "${node.id}" (${node.type}) is not reachable from Trigger.`);
      }
    }
  }

  // 6. Dead cycle check: any cycle must have at least one path to an 'end' node
  // Find all nodes that can reach an 'end' node (or terminate)
  const canReachEnd = new Set<string>();
  const endNodes = nodes.filter(
    (n) => n.type === "end" || (n.type === "goto_flow" && String(n.data?.mode || "handoff").toLowerCase() === "handoff")
  );
  for (const en of endNodes) {
    canReachEnd.add(en.id);
  }

  // Reverse BFS from all end nodes
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    incoming.get(edge.to)!.push(edge.from);
  }

  const endQueue = [...canReachEnd];
  while (endQueue.length > 0) {
    const curr = endQueue.shift()!;
    const parents = incoming.get(curr) || [];
    for (const p of parents) {
      if (!canReachEnd.has(p)) {
        canReachEnd.add(p);
        endQueue.push(p);
      }
    }
  }

  for (const node of nodes) {
    if (!canReachEnd.has(node.id)) {
      errors.push(`Infinite loop detected: Node "${node.id}" (${node.type}) has no path leading to an End node.`);
    }
  }

  const warnings: string[] = [];

  // Variable collision detection across API nodes
  const apiSaveVars = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.type === "api") {
      const saveVar = ((node.data?.save as string) || "api_result").trim();
      if (!apiSaveVars.has(saveVar)) {
        apiSaveVars.set(saveVar, []);
      }
      apiSaveVars.get(saveVar)!.push(node.id);
    }
  }

  for (const [varName, nodeIds] of apiSaveVars.entries()) {
    if (nodeIds.length > 1) {
      warnings.push(
        `Variable collision: ${nodeIds.length} API nodes (${nodeIds.map((id) => `"${id}"`).join(", ")}) save their response to the same variable "${varName}". Subsequent API executions will overwrite earlier data, causing data mismatch. Assign unique "Save Response As" variables (e.g. "${varName}_1", "${varName}_2") or configure explicit Field Mappings.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
