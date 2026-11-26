import { WorkflowGraph, WorkflowNode, WorkflowEdge, ASK_KINDS, AskKind } from "./types";
import { validateGraph } from "./validation";
import { STARTER_TEMPLATES, StarterTemplate } from "./starterTemplates";
import { cloneWorkflowGraph } from "./clone";

export interface GenerateTemplateOptions {
  templateId: string;
  name?: string;
  parameters?: Record<string, string>;
}

export interface GeneratePromptOptions {
  prompt: string;
  name?: string;
}

export interface GenerationResult {
  success: boolean;
  name: string;
  triggerType: "keyword" | "any_reply" | "first_message";
  triggerValue: string;
  graph: WorkflowGraph;
  errors?: string[];
  attempts: number;
}

/**
 * Replace placeholders like {{key}} in text string
 */
function interpolateText(text: string, params: Record<string, string>): string {
  let result = text;
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      // Replace case-insensitive {{key}} and {{ key }}
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, "gi");
      result = result.replace(regex, String(val));
    }
  }
  return result;
}

/**
 * Task 3 (a): Generate workflow from a starter template with customized parameters
 */
export function generateWorkflowFromTemplate(options: GenerateTemplateOptions): GenerationResult {
  const { templateId, name: customName, parameters = {} } = options;

  const template = STARTER_TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    throw new Error(`Starter template "${templateId}" not found. Available: ${STARTER_TEMPLATES.map((t) => t.id).join(", ")}`);
  }

  // Clone template graph to guarantee unique node and edge IDs
  const { graph: clonedGraph } = cloneWorkflowGraph(template.graph);

  const businessName = parameters.businessName || parameters.companyName || "";

  // Apply parameter interpolations across all nodes
  const updatedNodes: WorkflowNode[] = clonedGraph.nodes.map((node) => {
    const updatedData = { ...node.data };

    if (typeof updatedData.text === "string") {
      updatedData.text = interpolateText(updatedData.text, parameters);
      if (businessName) {
        updatedData.text = updatedData.text
          .replace(/the Clinic/gi, businessName)
          .replace(/Clinic/gi, businessName)
          .replace(/WA Engine/gi, businessName);
      }
    }

    if (typeof updatedData.keyword === "string") {
      if (parameters.triggerKeyword || parameters.keywords) {
        updatedData.keyword = parameters.triggerKeyword || parameters.keywords;
      }
    }

    return {
      ...node,
      data: updatedData,
    };
  });

  const finalGraph: WorkflowGraph = {
    nodes: updatedNodes,
    edges: clonedGraph.edges,
  };

  const validation = validateGraph(finalGraph);
  if (!validation.valid) {
    return {
      success: false,
      name: customName || template.name,
      triggerType: template.triggerType,
      triggerValue: parameters.keywords || template.triggerValue,
      graph: finalGraph,
      errors: validation.errors,
      attempts: 1,
    };
  }

  const generatedName =
    customName?.trim() ||
    (businessName ? `${businessName} - ${template.name}` : `${template.name} (Customized)`);

  return {
    success: true,
    name: generatedName,
    triggerType: template.triggerType,
    triggerValue: parameters.keywords || template.triggerValue,
    graph: finalGraph,
    attempts: 1,
  };
}

/**
 * Graph schema specification prompt fed to LLM or used for generation rules
 */
const GRAPH_SPECIFICATION_PROMPT = `
You are an expert conversational workflow designer for WhatsApp.
Generate a valid WhatsApp agent graph matching the user's intent.

Strict Graph Requirements:
1. The graph must contain an object: { "name": string, "triggerType": "keyword"|"first_message"|"any_reply", "triggerValue": string, "graph": { "nodes": [...], "edges": [...] } }
2. Nodes must have: { "id": string, "type": string, "position": { "x": number, "y": number }, "data": { ... } }
   - LAYOUT RULE: Arrange the workflow in a HORIZONTAL (left-to-right) direction with minimal compact spacing:
     Start "trigger" at { "x": 60, "y": 180 }, and advance each sequential step horizontally by +240 on X (x = 60, 300, 540, 780, ...). Keep parallel branches vertically offset by ±130 on Y.
3. Exactly ONE node of type "trigger" is required with port "next" and data { "keyword": string }.
4. Node types and their exact data schemas & component usage rules:
   - "trigger": data: { "keyword": string }
   - "message": data: { "text": string } (Use for informational text, confirmations, and summaries.)
   - "ask": data: { "text": string, "var": string (alphanumeric identifier), "kind": "text"|"number"|"email"|"date"|"time" }
     * Component selection for "ask":
       - Use kind "date" (Date Picker component) whenever asking for ANY date, calendar day, appointment date, start date, end date, or DOB. NEVER use "text" for dates.
       - Use kind "time" (Time Picker component) whenever asking for ANY time, time slot, appointment hour, or schedule. NEVER use "text" for times.
       - Use kind "email" for email addresses, kind "number" for numeric quantities/IDs, and kind "text" only for free-form text like names or comments.
   - "buttons": data: { "text": string, "opts": [{ "id": string, "title": string (max 20 chars) }] } (max 3 opts)
     * Use Quick Buttons whenever the user chooses between 2–3 options (e.g., Yes/No, Proceed/Cancel, Morning/Afternoon/Evening).
   - "list": data: { "text": string, "buttonText": string, "opts": [{ "id": string, "title": string, "description": string }] } (max 10 opts)
     * Use Menu List whenever there are 4 or more options or a menu of services/categories.
   - "condition": data: { "variable": string, "operator": "equals"|"not_equals"|"contains"|"not_contains"|"greater_than"|"less_than"|"is_empty"|"is_not_empty"|"exists", "value": string }
     * Use Condition (If / Else) for branching; MUST have outgoing edges with ports "true" and "false".
   - "calculation": data: { "operation": "add"|"subtract"|"multiply"|"divide"|"percentage"|"formula"|"date_diff_days"|"date_diff_hours"|"date_add_days", "operand_a": string, "operand_b": string, "save_to": string (alphanumeric variable name) }
     * Use Calculation for computing date differences (e.g., leave days between {{start_date}} and {{end_date}}) or numeric totals.
   - "api": data: { "url": string (valid http/https), "method": "GET"|"POST", "save": string }
     * Use Server API for external HTTP lookups/submissions; MUST have TWO outgoing edges: port "success" and port "error".
   - "end": data: { "text": string }
5. Edges must have: { "id": string, "from": string, "port": string, "to": string }
   - "trigger", "message", "ask", "calculation" nodes connect via port "next".
   - "buttons" node MUST have one edge per option where port matches the option's "id".
   - "list" node MUST have one edge per option where port matches the option's "id" (or "next").
   - "condition" node MUST have outgoing edges for ports "true" and "false".
   - "api" node MUST have TWO outgoing edges: one where port is "success" and one where port is "error".
   - "end" node is terminal and MUST NOT have any outgoing edges.
   - All nodes must be reachable from the "trigger" node. No disconnected nodes or orphan branches.

Return ONLY valid JSON matching the schema above. Do not include markdown fences or extra commentary.
`;

/**
 * Normalize node positions into a compact horizontal (left-to-right) layout with minimal spacing.
 */
function applyHorizontalLayout(graph: WorkflowGraph): WorkflowGraph {
  const trigger = graph.nodes.find((n) => n.type === "trigger") || graph.nodes[0];
  if (!trigger) return graph;

  const levelMap = new Map<string, number>();
  const queue: string[] = [trigger.id];
  levelMap.set(trigger.id, 0);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentLevel = levelMap.get(currentId) ?? 0;
    const outgoing = graph.edges.filter((e) => e.from === currentId);
    for (const edge of outgoing) {
      if (!levelMap.has(edge.to)) {
        levelMap.set(edge.to, currentLevel + 1);
        queue.push(edge.to);
      }
    }
  }

  // Group nodes by horizontal column (level) and center branches vertically around y = 180
  const columns = new Map<number, WorkflowNode[]>();
  let maxAssigned = 0;
  for (const node of graph.nodes) {
    const col = levelMap.get(node.id) ?? ++maxAssigned;
    if (col > maxAssigned) maxAssigned = col;
    const list = columns.get(col) || [];
    list.push(node);
    columns.set(col, list);
  }

  const posMap = new Map<string, { x: number; y: number }>();
  const X_START = 60;
  const X_GAP = 240;
  const Y_CENTER = 180;
  const Y_GAP = 130;

  for (const [col, colNodes] of columns.entries()) {
    const totalHeight = (colNodes.length - 1) * Y_GAP;
    const startY = Y_CENTER - totalHeight / 2;
    colNodes.forEach((n, idx) => {
      posMap.set(n.id, {
        x: X_START + col * X_GAP,
        y: Math.round(startY + idx * Y_GAP),
      });
    });
  }

  return {
    ...graph,
    nodes: graph.nodes.map((n) => ({
      ...n,
      position: posMap.get(n.id) || n.position,
    })),
  };
}

/**
 * Intelligent fallback generator when LLM API keys are not present in environment
 */
export function generateHeuristicGraph(prompt: string, customName?: string): {
  name: string;
  triggerType: "keyword" | "any_reply" | "first_message";
  triggerValue: string;
  graph: WorkflowGraph;
} {
  const p = prompt.toLowerCase();

  // 0. Calculation / Date Difference / Pricing & Total Calculator
  if (
    p.includes("diff") ||
    p.includes("calc") ||
    p.includes("math") ||
    p.includes("stay") ||
    p.includes("hotel") ||
    p.includes("total") ||
    p.includes("bill") ||
    p.includes("quote") ||
    p.includes("price")
  ) {
    const name = customName?.trim() || "Reservation & Price Calculator Agent";
    const graph: WorkflowGraph = {
      nodes: [
        {
          id: "trig_calc",
          type: "trigger",
          position: { x: 250, y: 50 },
          data: { keyword: "QUOTE, PRICE, BOOK, CALC, STAY", description: "Triggered on calculation & pricing requests" },
        },
        {
          id: "msg_intro",
          type: "message",
          position: { x: 250, y: 170 },
          data: { text: "Welcome! Let's calculate your reservation and total quotation." },
        },
        {
          id: "ask_checkin",
          type: "ask",
          position: { x: 250, y: 290 },
          data: {
            text: "Please select your Check-in Date:",
            var: "checkin_date",
            kind: "date",
          },
        },
        {
          id: "ask_checkout",
          type: "ask",
          position: { x: 250, y: 410 },
          data: {
            text: "Please select your Check-out Date:",
            var: "checkout_date",
            kind: "date",
          },
        },
        {
          id: "calc_days",
          type: "calculation",
          position: { x: 250, y: 530 },
          data: {
            operation: "date_diff_days",
            operand_a: "{{checkin_date}}",
            operand_b: "{{checkout_date}}",
            save_to: "stay_days",
            label: "Calculate Stay Days",
          },
        },
        {
          id: "calc_total",
          type: "calculation",
          position: { x: 250, y: 650 },
          data: {
            operation: "multiply",
            operand_a: "{{stay_days}}",
            operand_b: "120",
            save_to: "total_amount",
            round_decimals: 2,
            label: "Calculate Total Amount ($120/night)",
          },
        },
        {
          id: "btn_confirm",
          type: "buttons",
          position: { x: 250, y: 770 },
          data: {
            text: "Here is your calculation summary:\n\n• Check-in: {{checkin_date}}\n• Check-out: {{checkout_date}}\n• Total Nights: {{stay_days}} night(s)\n• Estimated Total: ${{total_amount}}\n\nWould you like to proceed or cancel?",
            opts: [
              { id: "btn_proceed", title: "Proceed" },
              { id: "btn_cancel", title: "Cancel" },
            ],
          },
        },
        {
          id: "msg_proceed",
          type: "message",
          position: { x: 120, y: 920 },
          data: { text: "Thank you! Your reservation for {{stay_days}} nights (${{total_amount}}) is being processed." },
        },
        {
          id: "msg_cancel",
          type: "message",
          position: { x: 380, y: 920 },
          data: { text: "Your request has been cancelled. Let us know if you need anything else!" },
        },
        {
          id: "end_booking",
          type: "end",
          position: { x: 250, y: 1040 },
          data: { text: "Have a wonderful day!" },
        },
      ],
      edges: [
        { id: "e1", from: "trig_calc", port: "next", to: "msg_intro" },
        { id: "e2", from: "msg_intro", port: "next", to: "ask_checkin" },
        { id: "e3", from: "ask_checkin", port: "next", to: "ask_checkout" },
        { id: "e4", from: "ask_checkout", port: "next", to: "calc_days" },
        { id: "e5", from: "calc_days", port: "next", to: "calc_total" },
        { id: "e6", from: "calc_total", port: "next", to: "btn_confirm" },
        { id: "e7", from: "btn_confirm", port: "btn_proceed", to: "msg_proceed" },
        { id: "e8", from: "btn_confirm", port: "btn_cancel", to: "msg_cancel" },
        { id: "e9", from: "msg_proceed", port: "next", to: "end_booking" },
        { id: "e10", from: "msg_cancel", port: "next", to: "end_booking" },
      ],
    };
    return { name, triggerType: "keyword", triggerValue: "QUOTE, PRICE, BOOK, CALC, STAY", graph };
  }

  // 1. Appointment / Booking / Calendar workflow (includes "date" ask node!)
  if (p.includes("date") || p.includes("calendar") || p.includes("appointment") || p.includes("book") || p.includes("schedule")) {
    const name = customName?.trim() || "Appointment Booking Agent";
    const graph: WorkflowGraph = {
      nodes: [
        {
          id: "trig_booking",
          type: "trigger",
          position: { x: 250, y: 50 },
          data: { keyword: "BOOK, APPOINTMENT, SCHEDULE, VISIT", description: "Triggered on booking keywords" },
        },
        {
          id: "msg_welcome",
          type: "message",
          position: { x: 250, y: 170 },
          data: { text: "Welcome! We're pleased to assist you with booking an appointment." },
        },
        {
          id: "ask_name",
          type: "ask",
          position: { x: 250, y: 290 },
          data: { text: "Please enter your full name:", var: "customer_name", kind: "text" },
        },
        {
          id: "ask_date",
          type: "ask",
          position: { x: 250, y: 410 },
          data: {
            text: "Please select your preferred date (e.g. 25/11/2026 or YYYY-MM-DD):",
            var: "selected_date",
            kind: "date",
          },
        },
        {
          id: "btn_time_slot",
          type: "buttons",
          position: { x: 250, y: 530 },
          data: {
            text: "Which time slot works best for you on {{selected_date}}?",
            opts: [
              { id: "opt_morning", title: "Morning (10:00 AM)" },
              { id: "opt_afternoon", title: "Afternoon (02:00 PM)" },
              { id: "opt_evening", title: "Evening (05:00 PM)" },
            ],
          },
        },
        {
          id: "msg_confirm_morning",
          type: "message",
          position: { x: 80, y: 690 },
          data: {
            text: "Confirmed! Your morning appointment for {{customer_name}} is booked for {{selected_date}} at 10:00 AM.",
          },
        },
        {
          id: "msg_confirm_afternoon",
          type: "message",
          position: { x: 280, y: 690 },
          data: {
            text: "Confirmed! Your afternoon appointment for {{customer_name}} is booked for {{selected_date}} at 02:00 PM.",
          },
        },
        {
          id: "msg_confirm_evening",
          type: "message",
          position: { x: 480, y: 690 },
          data: {
            text: "Confirmed! Your evening appointment for {{customer_name}} is booked for {{selected_date}} at 05:00 PM.",
          },
        },
        {
          id: "end_booking",
          type: "end",
          position: { x: 280, y: 830 },
          data: { text: "Thank you for scheduling with us. See you soon!" },
        },
      ],
      edges: [
        { id: "e1", from: "trig_booking", port: "next", to: "msg_welcome" },
        { id: "e2", from: "msg_welcome", port: "next", to: "ask_name" },
        { id: "e3", from: "ask_name", port: "next", to: "ask_date" },
        { id: "e4", from: "ask_date", port: "next", to: "btn_time_slot" },
        { id: "e5", from: "btn_time_slot", port: "opt_morning", to: "msg_confirm_morning" },
        { id: "e6", from: "btn_time_slot", port: "opt_afternoon", to: "msg_confirm_afternoon" },
        { id: "e7", from: "btn_time_slot", port: "opt_evening", to: "msg_confirm_evening" },
        { id: "e8", from: "msg_confirm_morning", port: "next", to: "end_booking" },
        { id: "e9", from: "msg_confirm_afternoon", port: "next", to: "end_booking" },
        { id: "e10", from: "msg_confirm_evening", port: "next", to: "end_booking" },
      ],
    };
    return { name, triggerType: "keyword", triggerValue: "BOOK, APPOINTMENT, SCHEDULE, VISIT", graph };
  }

  // 2. Feedback / Rating / Survey workflow
  if (p.includes("feedback") || p.includes("survey") || p.includes("rating") || p.includes("review") || p.includes("nps")) {
    const name = customName?.trim() || "Customer Feedback Survey Agent";
    const graph: WorkflowGraph = {
      nodes: [
        {
          id: "trig_feedback",
          type: "trigger",
          position: { x: 250, y: 50 },
          data: { keyword: "FEEDBACK, REVIEW, SURVEY, RATE", description: "Triggered on feedback keywords" },
        },
        {
          id: "btn_rating",
          type: "buttons",
          position: { x: 250, y: 180 },
          data: {
            text: "How would you rate your experience with us today?",
            opts: [
              { id: "rate_great", title: "⭐⭐⭐⭐⭐ Great" },
              { id: "rate_okay", title: "⭐⭐⭐ Average" },
              { id: "rate_poor", title: "⭐ Needs Work" },
            ],
          },
        },
        {
          id: "ask_comments",
          type: "ask",
          position: { x: 250, y: 340 },
          data: { text: "We appreciate your feedback! What could we do to make your experience even better?", var: "feedback_comments", kind: "text" },
        },
        {
          id: "msg_thanks",
          type: "message",
          position: { x: 250, y: 480 },
          data: { text: "Thank you for taking the time to share your feedback. We read every response!" },
        },
        {
          id: "end_feedback",
          type: "end",
          position: { x: 250, y: 620 },
          data: { text: "Have a wonderful rest of your day!" },
        },
      ],
      edges: [
        { id: "e1", from: "trig_feedback", port: "next", to: "btn_rating" },
        { id: "e2", from: "btn_rating", port: "rate_great", to: "ask_comments" },
        { id: "e3", from: "btn_rating", port: "rate_okay", to: "ask_comments" },
        { id: "e4", from: "btn_rating", port: "rate_poor", to: "ask_comments" },
        { id: "e5", from: "ask_comments", port: "next", to: "msg_thanks" },
        { id: "e6", from: "msg_thanks", port: "next", to: "end_feedback" },
      ],
    };
    return { name, triggerType: "keyword", triggerValue: "FEEDBACK, REVIEW, SURVEY, RATE", graph };
  }

  // 3. API Lookup / Tracking / Order status workflow
  if (p.includes("api") || p.includes("order") || p.includes("track") || p.includes("lookup")) {
    const name = customName?.trim() || "Order & Service Lookup Agent";
    const graph: WorkflowGraph = {
      nodes: [
        {
          id: "trig_order",
          type: "trigger",
          position: { x: 250, y: 50 },
          data: { keyword: "TRACK, STATUS, ORDER", description: "Triggered on tracking queries" },
        },
        {
          id: "ask_order_id",
          type: "ask",
          position: { x: 250, y: 180 },
          data: { text: "Please provide your reference or order number:", var: "order_id", kind: "text" },
        },
        {
          id: "api_fetch",
          type: "api",
          position: { x: 250, y: 320 },
          data: { url: "https://api.example.com/orders/{{order_id}}", method: "GET", save: "order_info" },
        },
        {
          id: "msg_found",
          type: "message",
          position: { x: 100, y: 470 },
          data: { text: "Order #{{order_id}} is {{order_info.status}}. Expected delivery: {{order_info.eta}}." },
        },
        {
          id: "msg_not_found",
          type: "message",
          position: { x: 400, y: 470 },
          data: { text: "Could not find order #{{order_id}}. Please check the reference number and try again." },
        },
        {
          id: "end_order",
          type: "end",
          position: { x: 250, y: 610 },
          data: { text: "Let us know if you need any additional help!" },
        },
      ],
      edges: [
        { id: "e1", from: "trig_order", port: "next", to: "ask_order_id" },
        { id: "e2", from: "ask_order_id", port: "next", to: "api_fetch" },
        { id: "e3", from: "api_fetch", port: "success", to: "msg_found" },
        { id: "e4", from: "api_fetch", port: "error", to: "msg_not_found" },
        { id: "e5", from: "msg_found", port: "next", to: "end_order" },
        { id: "e6", from: "msg_not_found", port: "next", to: "end_order" },
      ],
    };
    return { name, triggerType: "keyword", triggerValue: "TRACK, STATUS, ORDER", graph };
  }

  // 4. Default / General Agent workflow
  const name = customName?.trim() || "Customer Assistant Agent";
  const graph: WorkflowGraph = {
    nodes: [
      {
        id: "trig_main",
        type: "trigger",
        position: { x: 250, y: 50 },
        data: { keyword: "HI, HELLO, HELP, START", description: "Main conversational trigger" },
      },
      {
        id: "msg_intro",
        type: "message",
        position: { x: 250, y: 180 },
        data: { text: "Hello! Welcome to our automated WhatsApp assistance channel." },
      },
      {
        id: "btn_options",
        type: "buttons",
        position: { x: 250, y: 310 },
        data: {
          text: "How may we help you today?",
          opts: [
            { id: "opt_info", title: "General Info" },
            { id: "opt_support", title: "Talk to Human" },
          ],
        },
      },
      {
        id: "msg_info",
        type: "message",
        position: { x: 120, y: 460 },
        data: { text: "We are available 24/7 to answer your enquiries and process your requests." },
      },
      {
        id: "msg_support",
        type: "message",
        position: { x: 380, y: 460 },
        data: { text: "A customer specialist has been notified and will respond to this chat shortly." },
      },
      {
        id: "end_main",
        type: "end",
        position: { x: 250, y: 600 },
        data: { text: "Thank you for reaching out to us!" },
      },
    ],
    edges: [
      { id: "e1", from: "trig_main", port: "next", to: "msg_intro" },
      { id: "e2", from: "msg_intro", port: "next", to: "btn_options" },
      { id: "e3", from: "btn_options", port: "opt_info", to: "msg_info" },
      { id: "e4", from: "btn_options", port: "opt_support", to: "msg_support" },
      { id: "e5", from: "msg_info", port: "next", to: "end_main" },
      { id: "e6", from: "msg_support", port: "next", to: "end_main" },
    ],
  };

  return { name, triggerType: "keyword", triggerValue: "HI, HELLO, HELP, START", graph };
}

/**
 * Call Groq LLM API if GROQ_API_KEY is configured
 */
async function callLLM(prompt: string, errorFeedback?: string[]): Promise<any | null> {
  const groqKey = process.env.GROQ_API_KEY?.trim();

  if (!groqKey) {
    console.info("[generateWorkflow] GROQ_API_KEY not set — using heuristic generator fallback.");
    return null;
  }

  let userContent = `User Request: ${prompt}\n\nRespond with a valid JSON object.`;
  if (errorFeedback && errorFeedback.length > 0) {
    userContent += `\n\nCRITICAL FIX NEEDED: The previous graph generation had the following structural validation errors:\n${errorFeedback.map((e) => `- ${e}`).join("\n")}\nFix all these errors so the graph passes validateGraph() strictly. Return only valid JSON.`;
  }

  try {
    const baseUrl = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    console.info(`[generateWorkflow] Calling Groq (${model}) at ${baseUrl}/chat/completions...`);

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: GRAPH_SPECIFICATION_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn(`[generateWorkflow] Groq API call failed with status ${res.status}: ${errBody}`);
      return null;
    }

    const json = await res.json();
    const rawContent: string | undefined = json.choices?.[0]?.message?.content;
    if (rawContent) {
      const cleaned = rawContent
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");
      const parsed = JSON.parse(cleaned);
      console.info(
        `[generateWorkflow] Groq response received (model=${json.model || model}, nodes=${parsed?.graph?.nodes?.length ?? 0}, edges=${parsed?.graph?.edges?.length ?? 0}, triggerType=${parsed?.triggerType || "unknown"})`
      );
      return parsed;
    }
  } catch (err: any) {
    console.warn(`[generateWorkflow] Groq call error: ${err.message}`);
  }

  return null;
}

/**
 * Task 3 (b): Generate workflow from a natural language prompt with LLM, validation, and single retry on error.
 */
export async function generateWorkflowFromPrompt(options: GeneratePromptOptions): Promise<GenerationResult> {
  const { prompt, name: customName } = options;
  if (!prompt || !prompt.trim()) {
    throw new Error("Prompt cannot be empty.");
  }

  let attempts = 0;
  const initialFallback = generateHeuristicGraph(prompt, customName);
  let candidateGraph: WorkflowGraph = initialFallback.graph;
  let candidateName = customName || initialFallback.name;
  let candidateTriggerType: "keyword" | "any_reply" | "first_message" = initialFallback.triggerType;
  let candidateTriggerValue = initialFallback.triggerValue;
  let lastErrors: string[] = [];

  // Attempt 1: Initial Generation
  attempts = 1;
  const llmResult = await callLLM(prompt);

  if (llmResult && llmResult.graph && Array.isArray(llmResult.graph.nodes) && Array.isArray(llmResult.graph.edges)) {
    console.info("[generateWorkflow] Flow created from Groq LLM response.");
    candidateGraph = llmResult.graph;
    if (llmResult.name && !customName) candidateName = llmResult.name;
    if (llmResult.triggerType) candidateTriggerType = llmResult.triggerType;
    if (llmResult.triggerValue) candidateTriggerValue = llmResult.triggerValue;
  } else {
    console.info("[generateWorkflow] Groq unavailable/invalid; using heuristic fallback graph.");
    // Intelligent heuristic generator fallback
    candidateGraph = initialFallback.graph;
    candidateName = initialFallback.name;
    candidateTriggerType = initialFallback.triggerType;
    candidateTriggerValue = initialFallback.triggerValue;
  }

  // Validate Candidate Graph
  let validation = validateGraph(candidateGraph);
  if (validation.valid) {
    return {
      success: true,
      name: candidateName,
      triggerType: candidateTriggerType,
      triggerValue: candidateTriggerValue,
      graph: applyHorizontalLayout(candidateGraph),
      attempts,
    };
  }

  lastErrors = validation.errors;

  // Attempt 2: Retry once feeding back validation errors!
  attempts = 2;
  const retriedLlmResult = await callLLM(prompt, lastErrors);

  if (retriedLlmResult && retriedLlmResult.graph && Array.isArray(retriedLlmResult.graph.nodes)) {
    candidateGraph = retriedLlmResult.graph;
    if (retriedLlmResult.name && !customName) candidateName = retriedLlmResult.name;
    if (retriedLlmResult.triggerType) candidateTriggerType = retriedLlmResult.triggerType;
    if (retriedLlmResult.triggerValue) candidateTriggerValue = retriedLlmResult.triggerValue;
  } else {
    // Heuristic repair attempt
    const repaired = generateHeuristicGraph(prompt, customName);
    candidateGraph = repaired.graph;
  }

  const secondValidation = validateGraph(candidateGraph);
  if (secondValidation.valid) {
    return {
      success: true,
      name: candidateName,
      triggerType: candidateTriggerType,
      triggerValue: candidateTriggerValue,
      graph: applyHorizontalLayout(candidateGraph),
      attempts,
    };
  }

  // If still invalid after retry, NEVER save. Return errors!
  return {
    success: false,
    name: candidateName,
    triggerType: candidateTriggerType,
    triggerValue: candidateTriggerValue,
    graph: candidateGraph,
    errors: secondValidation.errors,
    attempts,
  };
}
