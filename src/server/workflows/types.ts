/**
 * Workflow Engine Types & Data Contracts
 * Defines graph structures, node payloads, ports, and run states.
 */

export type WorkflowTriggerType = "keyword" | "any_reply" | "first_message";
export type WorkflowStatus = "draft" | "active" | "archived";
export type WorkflowRunStatus =
  | "running"
  | "waiting_reply"
  | "completed"
  | "failed"
  | "expired";

export type NodeType =
  | "trigger"
  | "message"
  | "buttons"
  | "list"
  | "ask"
  | "api"
  | "condition"
  | "calculation"
  | "goto_flow"
  | "end";

export const CALCULATION_OPERATIONS = [
  "add",
  "subtract",
  "multiply",
  "divide",
  "percentage",
  "formula",
  "date_diff_days",
  "date_diff_hours",
  "date_diff_minutes",
  "date_add_days",
  "round",
  "floor",
  "ceil",
] as const;

export type CalculationOperation = (typeof CALCULATION_OPERATIONS)[number];

export interface CalculationNodeData {
  operation: CalculationOperation;
  operand_a: string;
  operand_b?: string;
  formula?: string;
  save_to: string;
  round_decimals?: number;
  label?: string;
}

export type GotoFlowMode = "handoff" | "subflow";

export interface GotoFlowNodeData {
  target_flow_id: string;
  target_flow_name?: string;
  mode: GotoFlowMode;
  entry_node_id?: string;
}

export interface FlowCallFrame {
  flowId: string;
  flowName: string;
  version: number;
  returnNodeId: string;
  returnPort: "completed" | "error";
}

export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "greater_than",
  "less_than",
  "is_empty",
  "is_not_empty",
  "exists",
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: "Equals (==)",
  not_equals: "Not Equals (!=)",
  contains: "Contains Text",
  not_contains: "Does Not Contain",
  greater_than: "Greater Than (>)",
  less_than: "Less Than (<)",
  is_empty: "Is Empty / Null",
  is_not_empty: "Is Not Empty",
  exists: "Variable Exists",
};

export const ASK_VALIDATION_KINDS = ["text", "number", "email", "date", "time"] as const;
export type AskValidationKind = (typeof ASK_VALIDATION_KINDS)[number];
export const ASK_KINDS = ASK_VALIDATION_KINDS;
export type AskKind = AskValidationKind;

export const ASK_KIND_LABELS: Record<AskKind, string> = {
  text: "Text (Any String)",
  number: "Number (Digits)",
  email: "Email Address",
  date: "📅 Date (Calendar Component)",
  time: "⏰ Time (Time Slot Component)",
};

/**
 * Normalizes legacy or unknown ask kind strings into a valid AskKind.
 */
export function normalizeAskKind(raw: any): AskKind {
  if (typeof raw !== "string") return "text";
  const lower = raw.trim().toLowerCase();
  if (lower === "calendar" || lower === "datetime" || lower === "day") return "date";
  if (lower === "string" || lower === "any") return "text";
  if (lower === "int" || lower === "float" || lower === "numeric") return "number";
  if (ASK_KINDS.includes(lower as AskKind)) return lower as AskKind;
  return "text";
}

export interface ButtonOption {
  id: string;
  title: string; // Meta max 20 chars
}

export interface ListOption {
  id: string;
  title: string; // Meta max 24 chars
  description?: string; // Meta max 72 chars
}

// -------------------------------------------------------------
// Node Payload Data Definitions
// -------------------------------------------------------------

export interface TriggerNodeData {
  keyword?: string; // comma-separated or pattern
  description?: string;
}

export interface MessageNodeData {
  text: string;
}

export interface ButtonsNodeData {
  text: string;
  opts: ButtonOption[]; // <= 3 options, title <= 20 chars
}

export interface ListNodeData {
  text: string;
  buttonText?: string; // Menu button label, default "Select Option"
  opts: ListOption[]; // <= 10 options, title <= 24 chars
}

export interface AskNodeData {
  text: string;
  var: string; // Target variable name to store answer
  kind: AskKind;
}

export interface ApiFieldMapping {
  from: string; // JSON path in response, e.g. "status" or "data.order_id"
  to: string; // Target context variable name, e.g. "order_status"
}

export interface ApiNodeData {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  authorization?: string; // Bearer token, Api-Key, etc.
  contentType?: string; // "application/json", "application/x-www-form-urlencoded", etc.
  headers?: Record<string, string>;
  body?: string;
  save?: string; // Target variable name in context to store response JSON
  mappings?: ApiFieldMapping[]; // Explicit response field mappings
}

export interface EndNodeData {
  text?: string;
}

export type WorkflowNodeData =
  | TriggerNodeData
  | MessageNodeData
  | ButtonsNodeData
  | ListNodeData
  | AskNodeData
  | ApiNodeData
  | EndNodeData;

export interface WorkflowNode {
  id: string;
  type: NodeType;
  position?: { x: number; y: number };
  data: Record<string, any>;
}

export interface WorkflowEdge {
  id?: string;
  from: string; // source node id
  port: string; // discrete port name: "next", "success", "error", or option ID
  to: string; // target node id
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowRecord {
  id: string;
  projectId: string;
  phoneNumberId: string | null;
  name: string;
  triggerType: WorkflowTriggerType;
  triggerValue: string | null;
  priority: number;
  status: WorkflowStatus;
  version: number;
  graph: WorkflowGraph;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunRecord {
  id: string;
  workflowId: string;
  workflowVersion: number;
  projectId: string;
  phoneNumberId: string | null;
  customerPhone: string;
  currentNodeId: string | null;
  status: WorkflowRunStatus;
  context: Record<string, any>;
  stepCount: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAuditLogRecord {
  id: string;
  runId: string;
  nodeId: string | null;
  event: string;
  detail: Record<string, any> | null;
  createdAt: string;
}

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}
