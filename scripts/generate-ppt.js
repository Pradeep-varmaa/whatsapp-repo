const pptxgen = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

async function generatePresentation() {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "WhatsApp Engine Team";
  pptx.title = "WhatsApp Workflow Builder - Complete Node & Variable Reference Guide";

  // Palette Constants
  const BG_COLOR = "0B132B"; // Deep dark navy
  const CARD_BG = "1C2541"; // Slate navy card
  const CARD_BORDER = "3A506B"; // Subtle border
  const TEXT_WHITE = "FFFFFF";
  const TEXT_MUTED = "94A3B8";
  const TEXT_BODY = "CBD5E1";
  
  // Node Accents
  const COLOR_TRIGGER = "F59E0B"; // Amber
  const COLOR_MSG = "7C3AED";     // Purple
  const COLOR_BTN = "8B5CF6";     // Violet
  const COLOR_LIST = "0284C7";    // Cyan
  const COLOR_ASK = "2563EB";     // Blue
  const COLOR_COND = "D97706";    // Orange/Gold
  const COLOR_API = "059669";     // Emerald
  const COLOR_GOTO = "6366F1";    // Indigo
  const COLOR_END = "DC2626";     // Red

  // Helper for slide header
  function addSlideHeader(slide, title, category, accentColor) {
    slide.background = { color: BG_COLOR };

    // Top Category / Tag
    slide.addText(category.toUpperCase(), {
      x: 0.8,
      y: 0.45,
      w: 10,
      h: 0.3,
      fontSize: 10,
      fontFace: "Arial",
      bold: true,
      color: accentColor,
      charSpacing: 2,
    });

    // Main Slide Title
    slide.addText(title, {
      x: 0.8,
      y: 0.75,
      w: 11,
      h: 0.55,
      fontSize: 22,
      fontFace: "Arial",
      bold: true,
      color: TEXT_WHITE,
    });

    // Subtle accent line under title
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.8,
      y: 1.35,
      w: 1.8,
      h: 0.04,
      fill: { color: accentColor },
      line: { color: accentColor },
    });
  }

  // =========================================================================
  // SLIDE 1: Title Slide
  // =========================================================================
  {
    const slide = pptx.addSlide();
    slide.background = { color: BG_COLOR };

    // Title Card Container
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 1.0,
      y: 1.0,
      w: 11.33,
      h: 5.5,
      rectRadius: 0.2,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1.5 },
    });

    // Badge
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 1.6,
      y: 1.6,
      w: 2.8,
      h: 0.4,
      rectRadius: 0.1,
      fill: { color: "059669" },
    });
    slide.addText("ENGINE WORKFLOW SPECIFICATION", {
      x: 1.6,
      y: 1.6,
      w: 2.8,
      h: 0.4,
      fontSize: 9,
      fontFace: "Arial",
      bold: true,
      color: TEXT_WHITE,
      align: "center",
      valign: "middle",
    });

    slide.addText("WhatsApp Workflow Builder", {
      x: 1.6,
      y: 2.2,
      w: 10.0,
      h: 0.9,
      fontSize: 32,
      fontFace: "Arial",
      bold: true,
      color: TEXT_WHITE,
    });

    slide.addText("Complete Node Catalog, Technical Details & Variable Assignments", {
      x: 1.6,
      y: 3.1,
      w: 10.0,
      h: 0.5,
      fontSize: 16,
      fontFace: "Arial",
      color: "38BDF8",
    });

    slide.addText(
      "Comprehensive architectural guide describing all 9 graph nodes in the WhatsApp Engine.\nCovers visual handles, configurations, state memory context, variable capture, interpolation tokens, and publish-time structural validation.",
      {
        x: 1.6,
        y: 3.8,
        w: 9.8,
        h: 1.2,
        fontSize: 12,
        fontFace: "Arial",
        color: TEXT_BODY,
        lineSpacing: 18,
      }
    );

    // Footer stats tags
    const tags = [
      { label: "Nodes: 9 Types", color: "2563EB" },
      { label: "DAG Engine: ReactFlow", color: "7C3AED" },
      { label: "Variables: Dynamic State Context", color: "059669" },
      { label: "Runtime: WhatsApp Cloud API", color: "D97706" },
    ];
    tags.forEach((t, i) => {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 1.6 + i * 2.5,
        y: 5.4,
        w: 2.3,
        h: 0.45,
        rectRadius: 0.08,
        fill: { color: "0B132B" },
        line: { color: t.color, width: 1 },
      });
      slide.addText(t.label, {
        x: 1.6 + i * 2.5,
        y: 5.4,
        w: 2.3,
        h: 0.45,
        fontSize: 9.5,
        fontFace: "Arial",
        bold: true,
        color: t.color,
        align: "center",
        valign: "middle",
      });
    });
  }

  // =========================================================================
  // SLIDE 2: Execution Architecture & Variable Memory System
  // =========================================================================
  {
    const slide = pptx.addSlide();
    addSlideHeader(slide, "Workflow Engine & Variable Memory Architecture", "Overview", "38BDF8");

    // 3 Columns: Memory State, Variable Lifecycle, Interpolation Syntax
    const cols = [
      {
        title: "🧠 1. Run State & Context Memory",
        accent: "38BDF8",
        points: [
          "Workflow runs persist an isolated context store: context: Record<string, any>.",
          "Stored in redis/database during user turn waits (e.g. Ask / Buttons / List).",
          "Automatically seeded upon flow launch with customer phone, timestamp, and keyword.",
          "Call stack persists subflow stack frames for Go to Flow returns.",
        ],
      },
      {
        title: "🔄 2. Variable Read & Write Flow",
        accent: "10B981",
        points: [
          "Write: Nodes like Ask, Server API, and Trigger write extracted values into context.",
          "Read: Message, API Headers/Body, and GotoFlow read variables to personalize payloads.",
          "Evaluation: Condition evaluates context[variable] against target literals.",
          "Persistence: Variables survive cross-turn pauses until flow finishes at End Flow.",
        ],
      },
      {
        title: "🔤 3. Token Interpolation Syntax",
        accent: "F59E0B",
        points: [
          "Supports mustache syntax: {{variable_name}} across messages and payloads.",
          "Dot notation for nested objects: {{api_response.user.first_name}}.",
          "Safe fallback: Unset variables render as empty string or fallback value without crashing.",
          "Built-in variables: {{phone_number}}, {{user_name}}, {{incoming_text}}, {{flow_id}}.",
        ],
      },
    ];

    cols.forEach((col, idx) => {
      const xPos = 0.8 + idx * 3.9;
      slide.addShape(pptx.ShapeType.roundRect, {
        x: xPos,
        y: 1.6,
        w: 3.7,
        h: 5.2,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: CARD_BORDER, width: 1 },
      });

      slide.addText(col.title, {
        x: xPos + 0.2,
        y: 1.8,
        w: 3.3,
        h: 0.45,
        fontSize: 13,
        fontFace: "Arial",
        bold: true,
        color: col.accent,
      });

      const bodyText = col.points.map((p) => `• ${p}`).join("\n\n");
      slide.addText(bodyText, {
        x: xPos + 0.2,
        y: 2.4,
        w: 3.3,
        h: 4.1,
        fontSize: 11,
        fontFace: "Arial",
        color: TEXT_BODY,
        lineSpacing: 16,
      });
    });
  }

  // =========================================================================
  // SLIDE 3: Trigger Node
  // =========================================================================
  {
    const slide = pptx.addSlide();
    addSlideHeader(slide, "Trigger Node — Inbound Entry Point", "Node 1 · Entry", COLOR_TRIGGER);

    // Left Column: Details & Fields
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: 1.6,
      w: 6.0,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Node Purpose & Configuration", {
      x: 1.1,
      y: 1.8,
      w: 5.4,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: COLOR_TRIGGER,
    });

    const triggerDetails = [
      "Role: Root node for every workflow graph. Exactly one Trigger per flow.",
      "Execution: Automatically matched against incoming WhatsApp messages by webhook router.",
      "Ports & Handles: Exactly 1 output handle: 'next' (at bottom center). No input handle.",
      "Configurable Fields:",
      "  • keyword (string): Inbound message text or prefix that activates this flow.",
      "  • title (string, optional): Display name in the workflow studio.",
      "Validation Rules: Exactly 1 per workflow; must have outgoing connection to next step; cannot be deleted.",
    ].join("\n\n");

    slide.addText(triggerDetails, {
      x: 1.1,
      y: 2.3,
      w: 5.4,
      h: 4.2,
      fontSize: 11,
      color: TEXT_BODY,
      lineSpacing: 15,
    });

    // Right Column: Variable Assignments Table
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 7.1,
      y: 1.6,
      w: 5.4,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Variable Assignments & Injected Context", {
      x: 7.4,
      y: 1.8,
      w: 4.8,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: "38BDF8",
    });

    slide.addText(
      "When a flow is initiated by an incoming message, the Trigger automatically injects core WhatsApp metadata into the workflow's state memory:",
      {
        x: 7.4,
        y: 2.25,
        w: 4.8,
        h: 0.65,
        fontSize: 10.5,
        color: TEXT_MUTED,
      }
    );

    const tableData = [
      [
        { text: "Variable Key", options: { bold: true, color: "FFFFFF", fill: { color: "0B132B" } } },
        { text: "Type", options: { bold: true, color: "FFFFFF", fill: { color: "0B132B" } } },
        { text: "Description", options: { bold: true, color: "FFFFFF", fill: { color: "0B132B" } } },
      ],
      [
        { text: "{{phone_number}}", options: { color: "38BDF8" } },
        { text: "string", options: { color: TEXT_MUTED } },
        { text: "Customer WhatsApp phone with country code (e.g. 919876543210)", options: { color: TEXT_BODY } },
      ],
      [
        { text: "{{sender_name}}", options: { color: "38BDF8" } },
        { text: "string", options: { color: TEXT_MUTED } },
        { text: "WhatsApp profile display name of sender", options: { color: TEXT_BODY } },
      ],
      [
        { text: "{{incoming_text}}", options: { color: "38BDF8" } },
        { text: "string", options: { color: TEXT_MUTED } },
        { text: "Exact raw text content of inbound trigger message", options: { color: TEXT_BODY } },
      ],
      [
        { text: "{{trigger_time}}", options: { color: "38BDF8" } },
        { text: "timestamp", options: { color: TEXT_MUTED } },
        { text: "ISO 8601 UTC timestamp of message arrival", options: { color: TEXT_BODY } },
      ],
      [
        { text: "{{message_id}}", options: { color: "38BDF8" } },
        { text: "string", options: { color: TEXT_MUTED } },
        { text: "Unique Meta WhatsApp message identifier (wamid)", options: { color: TEXT_BODY } },
      ],
    ];

    slide.addTable(tableData, {
      x: 7.3,
      y: 3.0,
      w: 5.0,
      colW: [1.6, 0.8, 2.6],
      fontSize: 9.5,
      border: { pt: 0.5, color: CARD_BORDER },
      autoPage: false,
    });
  }

  // =========================================================================
  // SLIDE 4: Message Node
  // =========================================================================
  {
    const slide = pptx.addSlide();
    addSlideHeader(slide, "Message Node — Outbound Communication", "Node 2 · Automation", COLOR_MSG);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: 1.6,
      w: 6.0,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Node Purpose & Configuration", {
      x: 1.1,
      y: 1.8,
      w: 5.4,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: COLOR_MSG,
    });

    const msgDetails = [
      "Role: Sends an outbound rich WhatsApp text message to the customer.",
      "Execution: Synchronous send via Meta Cloud API with deliverability logging.",
      "Ports & Handles:",
      "  • Input handle: Top center (connects from previous step).",
      "  • Output handle: 'next' (bottom center, routes to next action).",
      "Configurable Fields:",
      "  • text (string, required): Message text. Max 4096 characters.",
      "  • title (string, optional): Step label in canvas.",
      "Formatting Support: Full WhatsApp markdown (*bold*, _italic_, ~strikethrough~, ```monospace```).",
      "Validation Rules: text must not be empty; must have target connected.",
    ].join("\n\n");

    slide.addText(msgDetails, {
      x: 1.1,
      y: 2.3,
      w: 5.4,
      h: 4.2,
      fontSize: 11,
      color: TEXT_BODY,
      lineSpacing: 15,
    });

    // Right Column: Variable Interpolation
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 7.1,
      y: 1.6,
      w: 5.4,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Variable Consumption & Dynamic Tokens", {
      x: 7.4,
      y: 1.8,
      w: 4.8,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: "38BDF8",
    });

    const interpDetails = [
      "Token Replacement Engine:",
      "The message text is scanned for {{variable_name}} tokens at runtime. Each token is looked up in the active flow context memory and replaced with its runtime value.",
      "",
      "Example Template in Studio:",
      "\"Hello {{sender_name}}! Your appointment is confirmed for *{{selected_date}}* at *{{selected_time}}*. Your order ID is #{{order_id}}.\"",
      "",
      "Delivered WhatsApp Text:",
      "\"Hello Priya! Your appointment is confirmed for *25/11/2026* at *02:30 PM*. Your order ID is #ORD-9842.\"",
      "",
      "Key Behaviors:",
      "  • Variable assignments are read-only (Message node does not mutate variables).",
      "  • Unresolved tokens safely render as clean fallback text rather than crashing the flow.",
    ].join("\n");

    slide.addText(interpDetails, {
      x: 7.4,
      y: 2.3,
      w: 4.8,
      h: 4.2,
      fontSize: 10.5,
      color: TEXT_BODY,
      lineSpacing: 14,
    });
  }

  // =========================================================================
  // SLIDE 5: Quick Reply Buttons Node
  // =========================================================================
  {
    const slide = pptx.addSlide();
    addSlideHeader(slide, "Quick Buttons Node — Interactive 1-3 Click Choices", "Node 3 · Selection", COLOR_BTN);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: 1.6,
      w: 6.0,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Node Purpose & Configuration", {
      x: 1.1,
      y: 1.8,
      w: 5.4,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: COLOR_BTN,
    });

    const btnDetails = [
      "Role: Delivers an interactive WhatsApp button message allowing 1-tap responses.",
      "WhatsApp Limits: Strictly 1 to 3 buttons per message; button text max 20 characters.",
      "Ports & Handles:",
      "  • Input handle: Top center.",
      "  • Output handles: Discrete port for each button option (ID: opt_1, opt_2, opt_3).",
      "Configurable Fields:",
      "  • text (string, required): Body text explaining the options.",
      "  • opts (array): Array of button objects with { id: string, title: string }.",
      "Validation Rules: Must have between 1 and 3 buttons; button titles <= 20 chars; each button port must have an outgoing edge.",
    ].join("\n\n");

    slide.addText(btnDetails, {
      x: 1.1,
      y: 2.3,
      w: 5.4,
      h: 4.2,
      fontSize: 11,
      color: TEXT_BODY,
      lineSpacing: 15,
    });

    // Right Column: Variable Assignment & State Pause
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 7.1,
      y: 1.6,
      w: 5.4,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Variable Assignments & Turn State Pause", {
      x: 7.4,
      y: 1.8,
      w: 4.8,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: "38BDF8",
    });

    const btnVarDetails = [
      "Turn Pause Behavior:",
      "After transmitting the buttons, FlowRunner pauses the execution and waits for the customer's click event webhook from WhatsApp.",
      "",
      "Automatic Variable Assignments:",
      "When the user taps a button, the engine captures:",
      "  • {{last_button_id}}: Unique ID of clicked button (e.g. 'btn_yes').",
      "  • {{last_button_title}}: Label of clicked button (e.g. 'Confirm Order').",
      "  • {{user_response}}: Stored button title for generic downstream handlers.",
      "",
      "Branch Routing:",
      "FlowRunner matches the clicked button ID directly to the corresponding outgoing handle on the canvas, guiding the customer through that dedicated branch path.",
    ].join("\n");

    slide.addText(btnVarDetails, {
      x: 7.4,
      y: 2.3,
      w: 4.8,
      h: 4.2,
      fontSize: 10.5,
      color: TEXT_BODY,
      lineSpacing: 14,
    });
  }

  // =========================================================================
  // SLIDE 6: Menu List Node (Static & Dynamic API)
  // =========================================================================
  {
    const slide = pptx.addSlide();
    addSlideHeader(slide, "Menu List Node — Interactive Rows & Dynamic API Mapping", "Node 4 · Selection", COLOR_LIST);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: 1.6,
      w: 6.0,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Node Purpose & Configuration", {
      x: 1.1,
      y: 1.8,
      w: 5.4,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: COLOR_LIST,
    });

    const listDetails = [
      "Role: Sends a native WhatsApp radio list drawer (up to 10 selectable items).",
      "Two Operating Modes:",
      "  1. Static Mode: Fixed rows configured directly in studio UI.",
      "  2. Dynamic Mode: Automatically generates list rows from an API response array context.",
      "Configurable Fields:",
      "  • text (string): Header prompt text.",
      "  • buttonText (string): CTA button opening the drawer (e.g. 'View Menu').",
      "  • is_dynamic (boolean): Toggle for dynamic context mapping.",
      "  • dynamicRows.arrayPath: Context variable path (e.g. 'products' or 'api_data.items').",
      "  • dynamicRows.titleField & descField: Keys extracted from each object.",
    ].join("\n\n");

    slide.addText(listDetails, {
      x: 1.1,
      y: 2.3,
      w: 5.4,
      h: 4.2,
      fontSize: 11,
      color: TEXT_BODY,
      lineSpacing: 14,
    });

    // Right Column: Variable Assignments
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 7.1,
      y: 1.6,
      w: 5.4,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Variable Assignments & Dynamic Context", {
      x: 7.4,
      y: 1.8,
      w: 4.8,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: "38BDF8",
    });

    const listVarDetails = [
      "Variables Stored on Customer Selection:",
      "  • {{selected_list_id}}: Unique row ID (e.g. 'prod_101').",
      "  • {{selected_list_title}}: Title of chosen row (e.g. 'Espresso Roast').",
      "  • {{selected_list_item}}: Entire JSON object when in Dynamic API mode!",
      "",
      "Dynamic Mode Port Rule:",
      "In static mode, each row has its own dedicated branch port. In Dynamic Mode, since rows vary per customer, a single universal 'next' port carries all selections, making static node connections optional.",
      "",
      "Downstream Example:",
      "A following Message node can display: 'You selected {{selected_list_title}}! Total: ${{selected_list_item.price}}'.",
    ].join("\n");

    slide.addText(listVarDetails, {
      x: 7.4,
      y: 2.3,
      w: 4.8,
      h: 4.2,
      fontSize: 10.5,
      color: TEXT_BODY,
      lineSpacing: 14,
    });
  }

  // =========================================================================
  // SLIDE 7: Ask Question Node (with Date & Time)
  // =========================================================================
  {
    const slide = pptx.addSlide();
    addSlideHeader(slide, "Ask Question Node — Data Capture & Validation", "Node 5 · Capture", COLOR_ASK);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: 1.6,
      w: 6.0,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Node Purpose & Configuration", {
      x: 1.1,
      y: 1.8,
      w: 5.4,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: COLOR_ASK,
    });

    const askDetails = [
      "Role: Prompts customer for input, validates reply, and stores answer in a custom variable.",
      "Ports & Handles: 1 Input handle (top) and 1 Output handle 'next' (bottom).",
      "Configurable Fields:",
      "  • text (string, required): Question prompt text.",
      "  • var (string, required): Target variable identifier (e.g. 'customer_email', 'selected_date').",
      "  • kind (enum): Validation rule: 'text' | 'number' | 'email' | 'date' | 'time'.",
      "Supported Validation Kinds:",
      "  • text: Accepts any non-empty reply.",
      "  • number: Rejects non-digits; parses float/int.",
      "  • email: Validates standard RFC email syntax.",
      "  • date: Accepts DD/MM/YYYY, YYYY-MM-DD; normalizes to ISO.",
      "  • time: Accepts 12h/24h time strings (e.g. 2:30 PM, 14:30).",
    ].join("\n\n");

    slide.addText(askDetails, {
      x: 1.1,
      y: 2.3,
      w: 5.4,
      h: 4.2,
      fontSize: 10.5,
      color: TEXT_BODY,
      lineSpacing: 13,
    });

    // Right Column: Variable Assignment Specifics
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 7.1,
      y: 1.6,
      w: 5.4,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Target Variable Assignment & Error Recovery", {
      x: 7.4,
      y: 1.8,
      w: 4.8,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: "38BDF8",
    });

    const askVarDetails = [
      "Explicit Variable Assignment:",
      "The value captured from the customer is assigned directly to: context[data.var].",
      "",
      "Example Mapping:",
      "If var = 'booking_date' and kind = 'date':",
      "  Customer replies: '25/11/2026'",
      "  FlowRunner stores: context['booking_date'] = '2026-11-25'",
      "",
      "Validation Rejection & Retry Loop:",
      "If customer input violates the validation kind (e.g. 'hello' for email):",
      "  1. The variable is NOT updated.",
      "  2. FlowRunner responds with an automated correction prompt: 'Please provide a valid email address (e.g. name@example.com)'.",
      "  3. Execution remains paused on this step until valid input is received.",
    ].join("\n");

    slide.addText(askVarDetails, {
      x: 7.4,
      y: 2.3,
      w: 4.8,
      h: 4.2,
      fontSize: 10.5,
      color: TEXT_BODY,
      lineSpacing: 14,
    });
  }

  // =========================================================================
  // SLIDE 8: Condition Node
  // =========================================================================
  {
    const slide = pptx.addSlide();
    addSlideHeader(slide, "Condition Node — Dynamic Decision & Branching Logic", "Node 6 · Logic", COLOR_COND);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: 1.6,
      w: 6.0,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Node Purpose & Configuration", {
      x: 1.1,
      y: 1.8,
      w: 5.4,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: COLOR_COND,
    });

    const condDetails = [
      "Role: Evaluates a context variable against a threshold using 9 logical operators.",
      "Ports & Handles: 1 Input (top) and 2 discrete Output ports: 'true' and 'false'.",
      "Configurable Fields:",
      "  • variable (string, required): Variable to evaluate (e.g. 'order_total', 'user_type').",
      "  • operator (enum): Comparison operator.",
      "  • value (string/number): Target comparison literal.",
      "  • true_label / false_label: Custom labels displayed on edge lines in canvas.",
      "Supported Operators:",
      "  equals, not_equals, contains, not_contains, greater_than, less_than, is_empty, is_not_empty, matches_regex.",
    ].join("\n\n");

    slide.addText(condDetails, {
      x: 1.1,
      y: 2.3,
      w: 5.4,
      h: 4.2,
      fontSize: 10.5,
      color: TEXT_BODY,
      lineSpacing: 13,
    });

    // Right Column: Variable Evaluation & Branching
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 7.1,
      y: 1.6,
      w: 5.4,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Variable Evaluation Logic & Context Auditing", {
      x: 7.4,
      y: 1.8,
      w: 4.8,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: "38BDF8",
    });

    const condEvalDetails = [
      "Variable Lookup Protocol:",
      "FlowRunner retrieves val = context[data.variable].",
      "Type coercion is applied intelligently (e.g. string '150' is coerced to number for greater_than comparisons).",
      "",
      "Variable Assignment Output:",
      "Condition does not overwrite user data, but assigns audit metadata:",
      "  • {{last_condition_result}}: boolean (true / false).",
      "  • {{last_condition_eval}}: Human-readable string: 'order_total (250) > 100 => true'.",
      "",
      "Branch Routing:",
      "If evaluation returns true, FlowRunner transitions out of the 'true' handle. If false, it routes through 'false' (dashed edge). Both handles must be connected to pass publish validation.",
    ].join("\n");

    slide.addText(condEvalDetails, {
      x: 7.4,
      y: 2.3,
      w: 4.8,
      h: 4.2,
      fontSize: 10.5,
      color: TEXT_BODY,
      lineSpacing: 14,
    });
  }

  // =========================================================================
  // SLIDE 9: Server API Node
  // =========================================================================
  {
    const slide = pptx.addSlide();
    addSlideHeader(slide, "Server API Node — Webhook Request & Response Mapping", "Node 7 · Integration", COLOR_API);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: 1.6,
      w: 6.0,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Node Purpose & Configuration", {
      x: 1.1,
      y: 1.8,
      w: 5.4,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: COLOR_API,
    });

    const apiDetails = [
      "Role: Performs HTTP/HTTPS requests to internal/external backend systems.",
      "Ports & Handles: 1 Input (top) and 2 discrete Output handles: 'success' (HTTP 2xx) and 'error' (HTTP 4xx/5xx/timeout).",
      "Configurable Fields:",
      "  • method: GET | POST | PUT | PATCH | DELETE.",
      "  • url: Endpoint URL (supports variable tokens: https://api.crm.com/user/{{phone_number}}).",
      "  • headers & params: Key-value pairs for Auth tokens and queries.",
      "  • body: Raw JSON or form payload with {{variable}} substitution.",
      "  • responseMappings: Rules mapping JSON paths to context variables.",
      "Security: Protected by SSRF IP allowlisting (blocks 127.0.0.1, internal AWS metadata, etc.).",
    ].join("\n\n");

    slide.addText(apiDetails, {
      x: 1.1,
      y: 2.3,
      w: 5.4,
      h: 4.2,
      fontSize: 10,
      color: TEXT_BODY,
      lineSpacing: 13,
    });

    // Right Column: Response Field Mappings Table
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 7.1,
      y: 1.6,
      w: 5.4,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Variable Assignments: JSON Path Mapping", {
      x: 7.4,
      y: 1.8,
      w: 4.8,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: "38BDF8",
    });

    slide.addText(
      "The Server API node is the primary data ingestion engine. It maps JSON fields from the live API response into context variables:",
      {
        x: 7.4,
        y: 2.2,
        w: 4.8,
        h: 0.5,
        fontSize: 10,
        color: TEXT_MUTED,
      }
    );

    const apiTableData = [
      [
        { text: "API Response JSON Path", options: { bold: true, color: "FFFFFF", fill: { color: "0B132B" } } },
        { text: "Target Variable", options: { bold: true, color: "FFFFFF", fill: { color: "0B132B" } } },
        { text: "Example Stored Value", options: { bold: true, color: "FFFFFF", fill: { color: "0B132B" } } },
      ],
      [
        { text: "data.customer.id", options: { color: "38BDF8" } },
        { text: "customer_id", options: { color: "10B981", bold: true } },
        { text: "\"CUST-84920\"", options: { color: TEXT_BODY } },
      ],
      [
        { text: "data.account_balance", options: { color: "38BDF8" } },
        { text: "balance", options: { color: "10B981", bold: true } },
        { text: "4500.50", options: { color: TEXT_BODY } },
      ],
      [
        { text: "data.tier", options: { color: "38BDF8" } },
        { text: "vip_status", options: { color: "10B981", bold: true } },
        { text: "\"PLATINUM\"", options: { color: TEXT_BODY } },
      ],
      [
        { text: "products", options: { color: "38BDF8" } },
        { text: "catalog_items", options: { color: "10B981", bold: true } },
        { text: "[ { id: 1, name: ... } ] (Array for Dynamic List)", options: { color: TEXT_BODY } },
      ],
      [
        { text: "Automatic HTTP Metadata", options: { color: "F59E0B" } },
        { text: "api_status_code", options: { color: "10B981", bold: true } },
        { text: "200 (or 404, 500 on error port)", options: { color: TEXT_BODY } },
      ],
    ];

    slide.addTable(apiTableData, {
      x: 7.3,
      y: 2.8,
      w: 5.0,
      colW: [1.8, 1.4, 1.8],
      fontSize: 9,
      border: { pt: 0.5, color: CARD_BORDER },
      autoPage: false,
    });
  }

  // =========================================================================
  // SLIDE 10: Go to Flow Node
  // =========================================================================
  {
    const slide = pptx.addSlide();
    addSlideHeader(slide, "Go to Flow Node — Sub-flow Execution & Handoff", "Node 8 · Architecture", COLOR_GOTO);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: 1.6,
      w: 6.0,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Node Purpose & Configuration", {
      x: 1.1,
      y: 1.8,
      w: 5.4,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: COLOR_GOTO,
    });

    const gotoDetails = [
      "Role: Enables modular workflow design by delegating execution to other published flows.",
      "Two Operating Modes:",
      "  1. Sub-flow (Call & Return): Executes target flow like a function, then resumes back.",
      "  2. Handoff (Terminal Transfer): Permanently transfers customer to target flow.",
      "Ports & Handles:",
      "  • Sub-flow Mode: 1 Input and 2 Output handles ('completed' and 'error').",
      "  • Handoff Mode: 1 Input and 0 Output handles (terminal node).",
      "Validation & Governance:",
      "  • Prohibits cross-flow cycles (A -> B -> A).",
      "  • Enforces maximum call stack depth of 5 hops to prevent stack overflows.",
      "  • Deletion protection: Referenced target flows cannot be deleted.",
    ].join("\n\n");

    slide.addText(gotoDetails, {
      x: 1.1,
      y: 2.3,
      w: 5.4,
      h: 4.2,
      fontSize: 10.5,
      color: TEXT_BODY,
      lineSpacing: 13,
    });

    // Right Column: Context Passing & Call Stack Memory
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 7.1,
      y: 1.6,
      w: 5.4,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Variable Inheritance & Call Stack Frame", {
      x: 7.4,
      y: 1.8,
      w: 4.8,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: "38BDF8",
    });

    const gotoVarDetails = [
      "Context Inheritance:",
      "When invoking a target flow, the entire parent context store is inherited by the sub-flow. Variables set upstream (e.g. {{customer_id}}, {{phone_number}}) remain immediately accessible.",
      "",
      "Sub-flow Return Stack Frame:",
      "In Sub-flow mode, FlowRunner pushes an execution frame onto callStack:",
      "  { returnFlowId, returnNodeId, returnPort: 'completed' }",
      "",
      "When the sub-flow reaches an End Flow node, FlowRunner pops the stack frame and resumes the parent flow through the 'completed' handle.",
      "",
      "Variables Modified in Sub-flow:",
      "Variables mutated during sub-flow execution persist back into the parent flow upon return, allowing reusable utility flows (e.g. OTP Verification, Address Collection).",
    ].join("\n");

    slide.addText(gotoVarDetails, {
      x: 7.4,
      y: 2.3,
      w: 4.8,
      h: 4.2,
      fontSize: 10.5,
      color: TEXT_BODY,
      lineSpacing: 14,
    });
  }

  // =========================================================================
  // SLIDE 11: End Flow Node
  // =========================================================================
  {
    const slide = pptx.addSlide();
    addSlideHeader(slide, "End Flow Node — Lifecycle Termination & Metrics", "Node 9 · Lifecycle", COLOR_END);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: 1.6,
      w: 6.0,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Node Purpose & Configuration", {
      x: 1.1,
      y: 1.8,
      w: 5.4,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: COLOR_END,
    });

    const endDetails = [
      "Role: Explicitly marks the conclusion of a conversation workflow or sub-flow branch.",
      "Visual Design: Distinct stadium / pill shape (borderRadius: 9999px) with circular red disc icon.",
      "Ports & Handles: Exactly 1 Input handle (top center). No outgoing handles.",
      "Configurable Fields:",
      "  • text (string, optional): Internal notes or termination summary message.",
      "  • title (string, optional): Label on canvas.",
      "Validation Rules: Every reachable path in the workflow DAG must eventually resolve to either an End Flow node or a terminal Handoff node. Orphan branches produce validation errors.",
    ].join("\n\n");

    slide.addText(endDetails, {
      x: 1.1,
      y: 2.3,
      w: 5.4,
      h: 4.2,
      fontSize: 11,
      color: TEXT_BODY,
      lineSpacing: 15,
    });

    // Right Column: State Cleanup & Metric Recording
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 7.1,
      y: 1.6,
      w: 5.4,
      h: 5.2,
      rectRadius: 0.15,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 },
    });

    slide.addText("Session Finalization & Metric Recording", {
      x: 7.4,
      y: 1.8,
      w: 4.8,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: "38BDF8",
    });

    const endVarDetails = [
      "Sub-flow Return Trigger:",
      "If the current flow was invoked as a sub-flow (callStack.length > 0), reaching End Flow does not terminate the conversation; instead, it triggers the stack pop and returns to parent's 'completed' port.",
      "",
      "Root Flow Finalization:",
      "If running at root level, End Flow executes final session closure:",
      "  1. Marks execution run status = 'completed'.",
      "  2. Calculates total session duration and step count.",
      "  3. Emits execution run log summary into analytics warehouse.",
      "  4. Releases the customer session lock, allowing future inbound messages to trigger new workflows.",
    ].join("\n");

    slide.addText(endVarDetails, {
      x: 7.4,
      y: 2.3,
      w: 4.8,
      h: 4.2,
      fontSize: 10.5,
      color: TEXT_BODY,
      lineSpacing: 14,
    });
  }

  // =========================================================================
  // SLIDE 12: Master Variable Assignments Reference Table
  // =========================================================================
  {
    const slide = pptx.addSlide();
    addSlideHeader(slide, "Master Variable Assignments & State Context Matrix", "Reference Table", "10B981");

    slide.addText(
      "Comprehensive matrix detailing variable creation, consumption, and mutation across all 9 workflow nodes:",
      {
        x: 0.8,
        y: 1.5,
        w: 11.5,
        h: 0.3,
        fontSize: 11,
        color: TEXT_MUTED,
      }
    );

    const masterTable = [
      [
        { text: "Node Type", options: { bold: true, color: "FFFFFF", fill: { color: "0B132B" } } },
        { text: "Writes to Variables?", options: { bold: true, color: "FFFFFF", fill: { color: "0B132B" } } },
        { text: "Variable Name / Key", options: { bold: true, color: "FFFFFF", fill: { color: "0B132B" } } },
        { text: "Reads Variables?", options: { bold: true, color: "FFFFFF", fill: { color: "0B132B" } } },
        { text: "Execution State Impact", options: { bold: true, color: "FFFFFF", fill: { color: "0B132B" } } },
      ],
      [
        { text: "Trigger", options: { color: COLOR_TRIGGER, bold: true } },
        { text: "YES (Automatic)", options: { color: "10B981" } },
        { text: "{{phone_number}}, {{sender_name}}, {{incoming_text}}", options: { color: "38BDF8" } },
        { text: "No", options: { color: TEXT_MUTED } },
        { text: "Initializes run state context", options: { color: TEXT_BODY } },
      ],
      [
        { text: "Message", options: { color: COLOR_MSG, bold: true } },
        { text: "No", options: { color: TEXT_MUTED } },
        { text: "None", options: { color: TEXT_MUTED } },
        { text: "YES: {{any_token}}", options: { color: "10B981" } },
        { text: "Transmits outbound message", options: { color: TEXT_BODY } },
      ],
      [
        { text: "Quick Buttons", options: { color: COLOR_BTN, bold: true } },
        { text: "YES (On click)", options: { color: "10B981" } },
        { text: "{{last_button_id}}, {{last_button_title}}", options: { color: "38BDF8" } },
        { text: "YES: Body text tokens", options: { color: "10B981" } },
        { text: "Pauses flow for customer click", options: { color: TEXT_BODY } },
      ],
      [
        { text: "Menu List", options: { color: COLOR_LIST, bold: true } },
        { text: "YES (On select)", options: { color: "10B981" } },
        { text: "{{selected_list_id}}, {{selected_list_item}}", options: { color: "38BDF8" } },
        { text: "YES: Dynamic array path", options: { color: "10B981" } },
        { text: "Pauses flow for customer select", options: { color: TEXT_BODY } },
      ],
      [
        { text: "Ask Question", options: { color: COLOR_ASK, bold: true } },
        { text: "YES (Configurable)", options: { color: "10B981" } },
        { text: "{{data.var}} (custom target name)", options: { color: "F59E0B", bold: true } },
        { text: "YES: Prompt text tokens", options: { color: "10B981" } },
        { text: "Pauses flow until valid reply", options: { color: TEXT_BODY } },
      ],
      [
        { text: "Condition", options: { color: COLOR_COND, bold: true } },
        { text: "YES (Audit metadata)", options: { color: "10B981" } },
        { text: "{{last_condition_result}} (boolean)", options: { color: "38BDF8" } },
        { text: "YES: {{data.variable}}", options: { color: "10B981" } },
        { text: "Routes through true or false port", options: { color: TEXT_BODY } },
      ],
      [
        { text: "Server API", options: { color: COLOR_API, bold: true } },
        { text: "YES (JSON Mapping)", options: { color: "10B981" } },
        { text: "Custom mapped keys + {{api_status_code}}", options: { color: "F59E0B", bold: true } },
        { text: "YES: URL, Headers, Body", options: { color: "10B981" } },
        { text: "Routes success or error port", options: { color: TEXT_BODY } },
      ],
      [
        { text: "Go to Flow", options: { color: COLOR_GOTO, bold: true } },
        { text: "Inherited / Mutated", options: { color: "10B981" } },
        { text: "Full context passed & returned", options: { color: "38BDF8" } },
        { text: "YES: Context inheritance", options: { color: "10B981" } },
        { text: "Pushes/pops call stack frame", options: { color: TEXT_BODY } },
      ],
      [
        { text: "End Flow", options: { color: COLOR_END, bold: true } },
        { text: "No", options: { color: TEXT_MUTED } },
        { text: "None", options: { color: TEXT_MUTED } },
        { text: "No", options: { color: TEXT_MUTED } },
        { text: "Terminates flow or returns subflow", options: { color: TEXT_BODY } },
      ],
    ];

    slide.addTable(masterTable, {
      x: 0.8,
      y: 1.9,
      w: 11.7,
      colW: [1.6, 1.8, 3.2, 2.3, 2.8],
      fontSize: 8.8,
      border: { pt: 0.5, color: CARD_BORDER },
      autoPage: false,
    });
  }

  // Save the PPTX file
  const outputPath = path.join(process.cwd(), "public", "WhatsApp_Workflow_Nodes_Reference.pptx");
  const rootPath = path.join(process.cwd(), "WhatsApp_Workflow_Nodes_Reference.pptx");
  
  await pptx.writeFile({ fileName: outputPath });
  fs.copyFileSync(outputPath, rootPath);
  console.log(`Presentation generated successfully at:\n- ${outputPath}\n- ${rootPath}`);
}

generatePresentation().catch((err) => {
  console.error("Error generating presentation:", err);
  process.exit(1);
});
