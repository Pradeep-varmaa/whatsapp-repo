const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

function createPdf() {
  const doc = new PDFDocument({
    size: [960, 540], // 16:9 Landscape
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: false,
    info: {
      Title: "WhatsApp Workflow Builder - Elements, Fields, Validations & Condition Logic",
      Author: "WhatsApp Engine Architecture Team",
    },
  });

  const outputPath = path.join(process.cwd(), "public", "WhatsApp_Workflow_Builder_Guide.pdf");
  const rootPath = path.join(process.cwd(), "WhatsApp_Workflow_Builder_Guide.pdf");
  const brainPath = "C:/Users/ppvar/.gemini/antigravity/brain/24aefcc8-7498-4260-af2b-79a7109d91d3/WhatsApp_Workflow_Builder_Guide.pdf";

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  // Palette matching the PDF
  const C_DARK_GREEN = "#0E3B32";
  const C_LIGHT_GREEN_BG = "#EBF5F0";
  const C_CARD_BG = "#F1F7F4";
  const C_BORDER = "#D1E2DB";
  const C_TEXT_DARK = "#0F3D32";
  const C_TEXT_TITLE = "#0B2B24";
  const C_TEXT_BODY = "#2D3748";
  const C_TEXT_MUTED = "#64748B";
  const C_WHITE = "#FFFFFF";
  const C_TABLE_HEADER = "#0E3B32";

  // Node Color Codes
  const COLOR_TRIGGER = "#F59E0B";
  const COLOR_MSG = "#7C3AED";
  const COLOR_BTN = "#8B5CF6";
  const COLOR_LIST = "#0284C7";
  const COLOR_ASK = "#2563EB";
  const COLOR_DATE = "#0F766E";
  const COLOR_TIME = "#059669";
  const COLOR_COND = "#EA580C";
  const COLOR_API = "#059669";
  const COLOR_END = "#DC2626";

  // Helper for content page header
  function addPageHeader(doc, title, subtitle, pageNum) {
    doc.addPage();
    // White background
    doc.rect(0, 0, 960, 540).fill(C_WHITE);

    // Header Title
    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(26).text(title, 45, 36, { width: 870, align: "center" });

    // Subtitle
    if (subtitle) {
      doc.fillColor(C_TEXT_MUTED).font("Helvetica").fontSize(11.5).text(subtitle, 45, 78, { width: 870, align: "left" });
    }

    // Page number bottom right
    doc.fillColor(C_TEXT_MUTED).font("Helvetica").fontSize(9.5).text(String(pageNum), 900, 510, { width: 30, align: "right" });
  }

  // Draw authentic node diagram matching our editor UI
  function drawNodeCard(doc, x, y, options) {
    const {
      type = "message",
      title = "Node Title",
      subtitle = "Category · Detail",
      iconColor = "#2563EB",
      iconType = "zap",
      hasTopHandle = true,
      hasBottomHandle = true,
      bottomPorts = ["next"],
      isPill = false,
      w = 260,
      h = 60,
    } = options;

    doc.save();

    // Node card drop shadow
    doc.roundedRect(x + 1, y + 2, w, h, isPill ? 30 : 12).fillOpacity(0.04).fill("#000000");

    // Node container
    doc.roundedRect(x, y, w, h, isPill ? 30 : 12).fillOpacity(1).fill(C_WHITE).strokeColor("#E2E8F0").lineWidth(1).stroke();

    // Top Handle Dot (slate gray with white border)
    if (hasTopHandle) {
      doc.circle(x + w / 2, y, 4.5).fillColor("#64748B").fill();
      doc.circle(x + w / 2, y, 4.5).lineWidth(1.8).strokeColor(C_WHITE).stroke();
    }

    // Icon Container (38x38px solid color box)
    const iconBoxSize = isPill ? 34 : 36;
    const iconX = x + 12;
    const iconY = y + (h - iconBoxSize) / 2;

    if (isPill) {
      doc.circle(iconX + iconBoxSize / 2, iconY + iconBoxSize / 2, iconBoxSize / 2).fillColor(iconColor).fill();
    } else {
      doc.roundedRect(iconX, iconY, iconBoxSize, iconBoxSize, 9).fillColor(iconColor).fill();
    }

    // Draw Vector Icon in Icon Box
    doc.fillColor(C_WHITE).strokeColor(C_WHITE).lineWidth(1.6);
    const cx = iconX + iconBoxSize / 2;
    const cy = iconY + iconBoxSize / 2;

    if (iconType === "zap") {
      doc.path(`M ${cx - 2} ${cy - 8} L ${cx + 4} ${cy - 8} L ${cx} ${cy - 1} L ${cx + 5} ${cy - 1} L ${cx - 4} ${cy + 9} L ${cx - 1} ${cy + 1} L ${cx - 5} ${cy + 1} Z`).fill();
    } else if (iconType === "bot") {
      doc.rect(cx - 7, cy - 5, 14, 11).fill();
      doc.rect(cx - 1, cy - 8, 2, 3).fill();
      doc.circle(cx - 3.5, cy, 1.2).fillColor(iconColor).fill();
      doc.circle(cx + 3.5, cy, 1.2).fillColor(iconColor).fill();
      doc.rect(cx - 4, cy + 3, 8, 1.2).fillColor(iconColor).fill();
    } else if (iconType === "user") {
      doc.circle(cx, cy - 3, 4).fill();
      doc.path(`M ${cx - 7} ${cy + 7} C ${cx - 7} ${cy + 1}, ${cx + 7} ${cy + 1}, ${cx + 7} ${cy + 7} Z`).fill();
    } else if (iconType === "radio") {
      doc.circle(cx, cy, 7).lineWidth(1.8).stroke();
      doc.circle(cx, cy, 3).fill();
    } else if (iconType === "list") {
      for (let i = -4; i <= 4; i += 4) {
        doc.circle(cx - 6, cy + i, 1.2).fill();
        doc.rect(cx - 2, cy + i - 0.8, 9, 1.6).fill();
      }
    } else if (iconType === "fork") {
      doc.circle(cx, cy + 6, 2).fill();
      doc.circle(cx - 6, cy - 5, 2).fill();
      doc.circle(cx + 6, cy - 5, 2).fill();
      doc.path(`M ${cx} ${cy + 4} L ${cx} ${cy} M ${cx} ${cy} L ${cx - 6} ${cy - 3} M ${cx} ${cy} L ${cx + 6} ${cy - 3}`).lineWidth(1.8).stroke();
    } else if (iconType === "globe") {
      doc.circle(cx, cy, 7).lineWidth(1.5).stroke();
      doc.ellipse(cx, cy, 3.5, 7).lineWidth(1.2).stroke();
      doc.moveTo(cx - 7, cy).lineTo(cx + 7, cy).lineWidth(1.2).stroke();
    } else if (iconType === "calendar") {
      doc.rect(cx - 7, cy - 6, 14, 13).lineWidth(1.5).stroke();
      doc.rect(cx - 7, cy - 6, 14, 3.5).fill();
      doc.rect(cx - 4, cy - 8, 1.5, 3).fill();
      doc.rect(cx + 2.5, cy - 8, 1.5, 3).fill();
    } else if (iconType === "clock") {
      doc.circle(cx, cy, 7).lineWidth(1.6).stroke();
      doc.moveTo(cx, cy).lineTo(cx, cy - 4.5).lineWidth(1.5).stroke();
      doc.moveTo(cx, cy).lineTo(cx + 3.5, cy).lineWidth(1.5).stroke();
    } else if (iconType === "disc") {
      doc.circle(cx, cy, 7).lineWidth(1.6).stroke();
      doc.circle(cx, cy, 3.2).fill();
    }

    // Texts on Node Card
    const textX = iconX + iconBoxSize + 10;
    doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(11.5).text(title, textX, y + 14, { width: w - iconBoxSize - 30, height: 16, ellipsis: true });
    doc.fillColor("#64748B").font("Helvetica").fontSize(9.5).text(subtitle, textX, y + 32, { width: w - iconBoxSize - 30, height: 14, ellipsis: true });

    // Bottom Output Handles & Port Badges
    if (hasBottomHandle) {
      if (bottomPorts.length === 1) {
        // Single central handle
        doc.circle(x + w / 2, y + h, 4.5).fillColor("#64748B").fill();
        doc.circle(x + w / 2, y + h, 4.5).lineWidth(1.8).strokeColor(C_WHITE).stroke();

        // Stub line and port badge
        doc.moveTo(x + w / 2, y + h).lineTo(x + w / 2, y + h + 16).lineWidth(1.8).strokeColor("#94A3B8").stroke();
        doc.roundedRect(x + w / 2 - 28, y + h + 16, 56, 18, 9).fillColor("#94A3B8").fill();
        doc.fillColor(C_WHITE).font("Helvetica-Bold").fontSize(8.5).text(bottomPorts[0], x + w / 2 - 28, y + h + 21, { width: 56, align: "center" });
      } else {
        // Multiple ports (e.g. Buttons, Condition, API)
        const spacing = w / (bottomPorts.length + 1);
        bottomPorts.forEach((port, idx) => {
          const px = x + spacing * (idx + 1);
          doc.circle(px, y + h, 4).fillColor("#64748B").fill();
          doc.circle(px, y + h, 4).lineWidth(1.8).strokeColor(C_WHITE).stroke();

          // Stub line and badge
          doc.moveTo(px, y + h).lineTo(px, y + h + 14).lineWidth(1.6).strokeColor("#94A3B8").stroke();
          const bw = Math.max(46, port.length * 6 + 14);
          const isAlt = port.toLowerCase().includes("false") || port.toLowerCase().includes("error");
          doc.roundedRect(px - bw / 2, y + h + 14, bw, 17, 8.5).fillColor(isAlt ? "#64748B" : "#2563EB").fill();
          doc.fillColor(C_WHITE).font("Helvetica-Bold").fontSize(8).text(port, px - bw / 2, y + h + 18.5, { width: bw, align: "center" });
        });
      }
    }

    doc.restore();
  }

  // Draw Table for Node Details
  function drawTable(doc, x, y, w, headers, rows) {
    const rowH = 26;
    const headerH = 24;

    // Header background
    doc.roundedRect(x, y, w, headerH, 4).fill(C_TABLE_HEADER);
    let colX = x;
    headers.forEach((h) => {
      doc.fillColor(C_WHITE).font("Helvetica-Bold").fontSize(9).text(h.title, colX + 6, y + 7, { width: h.w - 12 });
      colX += h.w;
    });

    // Rows
    let rowY = y + headerH;
    rows.forEach((row, rIdx) => {
      const isEven = rIdx % 2 === 0;
      doc.rect(x, rowY, w, rowH).fill(isEven ? "#FAFCFA" : "#FFFFFF");
      doc.moveTo(x, rowY + rowH).lineTo(x + w, rowY + rowH).lineWidth(0.6).strokeColor("#E2E8F0").stroke();

      let cellX = x;
      row.forEach((cell, cIdx) => {
        const colW = headers[cIdx].w;
        doc.fillColor(cIdx === 0 ? "#0F172A" : C_TEXT_BODY).font(cIdx === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).text(cell, cellX + 6, rowY + 7, { width: colW - 12 });
        cellX += colW;
      });
      rowY += rowH;
    });
  }

  // =========================================================================
  // PAGE 1: Cover Slide
  // =========================================================================
  {
    doc.addPage();
    doc.rect(0, 0, 960, 540).fill(C_DARK_GREEN);

    // Left Title Area
    doc.fillColor(C_WHITE).font("Helvetica-Bold").fontSize(42).text("WhatsApp Workflow\nBuilder", 50, 150, { width: 500, lineGap: 6 });

    doc.fillColor("#A7F3D0").font("Helvetica-Bold").fontSize(18).text("Elements, fields, validations and condition logic", 50, 270, { width: 500 });

    doc.fillColor("#E2E8F0").font("Helvetica").fontSize(12).text(
      "Reference guide for all workflow elements, input parameters, publishing validations, WhatsApp runtime behavior and the Condition (If / Else) decision engine.",
      50,
      330,
      { width: 500, lineGap: 6 }
    );

    // Right Spine: Connected Node Badges
    const spineX = 810;
    doc.moveTo(spineX, 110).lineTo(spineX, 430).lineWidth(2.5).strokeColor("rgba(255, 255, 255, 0.35)").stroke();

    const spineBadges = [
      { y: 110, color: COLOR_TRIGGER, icon: "zap" },
      { y: 174, color: "#2563EB", icon: "bot" },
      { y: 238, color: COLOR_LIST, icon: "list" },
      { y: 302, color: COLOR_ASK, icon: "user" },
      { y: 366, color: COLOR_MSG, icon: "fork" },
      { y: 430, color: "#10B981", icon: "disc" },
    ];

    spineBadges.forEach((b) => {
      doc.circle(spineX, b.y, 19).fillColor(b.color).fill();
      doc.circle(spineX, b.y, 22).lineWidth(2).strokeColor("rgba(255, 255, 255, 0.4)").stroke();
    });
  }

  // =========================================================================
  // PAGE 2: What This Deck Covers
  // =========================================================================
  {
    addPageHeader(doc, "What this deck covers", null, 2);

    const topics = [
      { num: 1, title: "Architecture and canvas" },
      { num: 2, title: "Trigger" },
      { num: 3, title: "Message" },
      { num: 4, title: "Quick Buttons" },
      { num: 5, title: "Menu List" },
      { num: 6, title: "Ask Question" },
      { num: 7, title: "Date Picker" },
      { num: 8, title: "Time Picker" },
      { num: 9, title: "Condition (If / Else)" },
      { num: 10, title: "Server API" },
      { num: 11, title: "End Flow" },
      { num: 12, title: "Master validation matrix" },
      { num: 13, title: "Soft delete safeguards" },
    ];

    const cardW = 270;
    const cardH = 54;
    const startX = 45;
    const startY = 110;
    const gapX = 25;
    const gapY = 20;

    topics.forEach((t, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = startX + col * (cardW + gapX);
      const cy = startY + row * (cardH + gapY);

      doc.roundedRect(cx, cy, cardW, cardH, 8).fill(C_LIGHT_GREEN_BG);

      // Circle badge with number
      doc.circle(cx + 30, cy + cardH / 2, 14).fillColor(C_DARK_GREEN).fill();
      doc.fillColor(C_WHITE).font("Helvetica-Bold").fontSize(11).text(String(t.num), cx + 18, cy + cardH / 2 - 5, { width: 24, align: "center" });

      // Title
      doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text(t.title, cx + 55, cy + cardH / 2 - 6, { width: cardW - 65 });
    });
  }

  // =========================================================================
  // PAGE 3: Architecture and Canvas Mechanics
  // =========================================================================
  {
    addPageHeader(doc, "Architecture and canvas mechanics", "Every workflow is a directed acyclic graph of nodes (steps) joined by edges (ports) on the WhatsApp Business Cloud API.", 3);

    // Top horizontal sequence of nodes
    const seq = [
      { title: "Trigger", color: COLOR_TRIGGER },
      { title: "Message", color: "#2563EB" },
      { title: "Menu List", color: COLOR_LIST },
      { title: "Ask Question", color: COLOR_COND },
      { title: "End Flow", color: "#475569" },
    ];

    const seqStartX = 50;
    const seqY = 120;
    const boxW = 140;
    const boxH = 46;
    const arrowGap = 35;

    seq.forEach((item, idx) => {
      const bx = seqStartX + idx * (boxW + arrowGap);
      doc.roundedRect(bx, seqY, boxW, boxH, 8).fill(item.color);
      doc.fillColor(C_WHITE).font("Helvetica-Bold").fontSize(13).text(item.title, bx, seqY + 16, { width: boxW, align: "center" });

      if (idx < seq.length - 1) {
        // Arrow
        const ax = bx + boxW + 8;
        doc.moveTo(ax, seqY + boxH / 2).lineTo(ax + 18, seqY + boxH / 2).lineWidth(2).strokeColor("#64748B").stroke();
        doc.path(`M ${ax + 18} ${seqY + boxH / 2} L ${ax + 13} ${seqY + boxH / 2 - 4} L ${ax + 13} ${seqY + boxH / 2 + 4} Z`).fillColor("#64748B").fill();
      }
    });

    // 3 Large Feature Cards
    const cards = [
      {
        icon: "📍",
        title: "Single active node",
        desc: "The customer conversation advances step by step through connected ports. FlowRunner pauses on user interaction nodes and resumes on inbound replies.",
      },
      {
        icon: "💾",
        title: "State and context storage",
        desc: "Responses, dates, selected button IDs and API payloads are kept in a persistent JSON context object, preserved across turns and available to all downstream steps.",
      },
      {
        icon: "🔤",
        title: "Variable interpolation",
        desc: "Any field can render dynamic context with {{variable_name}} or dot notation such as {{api_result.user.name}}. Token replacement is performed synchronously before send.",
      },
    ];

    const cW = 270;
    const cH = 240;
    const cY = 210;

    cards.forEach((card, idx) => {
      const cx = 50 + idx * (cW + 30);
      doc.roundedRect(cx, cY, cW, cH, 12).fill(C_LIGHT_GREEN_BG);

      // Icon circle badge
      doc.circle(cx + 42, cY + 45, 20).fillColor(C_DARK_GREEN).fill();
      doc.fillColor(C_WHITE).font("Helvetica-Bold").fontSize(16).text(card.icon, cx + 22, cY + 34, { width: 40, align: "center" });

      // Title
      doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(15).text(card.title, cx + 22, cY + 85, { width: cW - 44 });

      // Desc
      doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(11).text(card.desc, cx + 22, cY + 115, { width: cW - 44, lineGap: 5 });
    });
  }

  // =========================================================================
  // PAGE 4: Trigger Node
  // =========================================================================
  {
    addPageHeader(doc, "Trigger node", "Entry point: exactly one per workflow", 4);

    // Left Container
    doc.roundedRect(45, 110, 320, 160, 10).fill(C_LIGHT_GREEN_BG);
    drawNodeCard(doc, 75, 130, {
      type: "trigger",
      title: "Trigger Keyword",
      subtitle: 'Trigger · "start, hi, hello, menu"',
      iconColor: COLOR_TRIGGER,
      iconType: "zap",
      hasTopHandle: false,
      bottomPorts: ["next"],
    });

    // Purpose & Runtime text below
    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("Purpose", 45, 300);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "Watches incoming WhatsApp text messages and starts a run when one matches a configured keyword.",
      45,
      320,
      { width: 320, lineGap: 4 }
    );

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("WhatsApp runtime", 45, 385);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "Text is lowercased and trimmed. On a keyword match, a new workflow_run is created and advances to the connected node.",
      45,
      405,
      { width: 320, lineGap: 4 }
    );

    // Right Side Table
    const headers = [
      { title: "Field", w: 130 },
      { title: "Type", w: 70 },
      { title: "Required", w: 70 },
      { title: "Description and example", w: 250 },
    ];
    const rows = [
      ["Trigger Keywords", "String", "No", "Comma-separated, case-insensitive. e.g. hi, hello, menu, book, appointment"],
      ["Description", "String", "No", "Internal admin notes. e.g. Customer booking and support triage flow"],
    ];
    drawTable(doc, 395, 110, 520, headers, rows);

    // Right Validation Box
    doc.roundedRect(395, 220, 520, 110, 8).fill(C_LIGHT_GREEN_BG);
    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(12).text("Validation rules", 415, 235);
    const rules = [
      "• Exactly one Trigger node is required per workflow",
      "• Exactly one outgoing edge, on the next port",
      "• No incoming connections: it is the root of the graph",
    ];
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(rules.join("\n\n"), 415, 260, { width: 480, lineGap: 4 });
  }

  // =========================================================================
  // PAGE 5: Message Node
  // =========================================================================
  {
    addPageHeader(doc, "Message node", "Outbound text", 5);

    doc.roundedRect(45, 110, 320, 160, 10).fill(C_LIGHT_GREEN_BG);
    drawNodeCard(doc, 75, 130, {
      type: "message",
      title: "Msg: fine collected",
      subtitle: "Automation · Text message",
      iconColor: COLOR_MSG,
      iconType: "bot",
      bottomPorts: ["next"],
    });

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("Purpose", 45, 300);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "Sends one outbound text message on WhatsApp. Supports emoji, markdown (bold, italic, strikethrough) and variable tokens.",
      45,
      320,
      { width: 320, lineGap: 4 }
    );

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("WhatsApp runtime", 45, 385);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "Resolves every {{token}} against the customer context, calls messagingService.sendMessage(), then flows to the node on next.",
      45,
      405,
      { width: 320, lineGap: 4 }
    );

    const headers = [
      { title: "Field", w: 130 },
      { title: "Type", w: 70 },
      { title: "Required", w: 70 },
      { title: "Description and example", w: 250 },
    ];
    const rows = [
      ["Message Text", "Textarea", "Yes", "Text sent to WhatsApp; accepts {{variable}} syntax. e.g. Hi {{name}}! Your booking on {{selected_date}} is confirmed."],
    ];
    drawTable(doc, 395, 110, 520, headers, rows);

    doc.roundedRect(395, 200, 520, 100, 8).fill(C_LIGHT_GREEN_BG);
    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(12).text("Validation rules", 415, 215);
    const rules = [
      "• text must not be empty (minimum 1 character)",
      "• The next port must connect to another node or an End node",
    ];
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(rules.join("\n\n"), 415, 240, { width: 480, lineGap: 4 });
  }

  // =========================================================================
  // PAGE 6: Quick Buttons Node
  // =========================================================================
  {
    addPageHeader(doc, "Quick Buttons node", "Interactive message with 1 to 3 buttons", 6);

    doc.roundedRect(45, 110, 320, 160, 10).fill(C_LIGHT_GREEN_BG);
    drawNodeCard(doc, 75, 130, {
      type: "buttons",
      title: "Quick Reply Buttons",
      subtitle: "Buttons · 3 options",
      iconColor: COLOR_BTN,
      iconType: "radio",
      bottomPorts: ["btn_book", "btn_status", "btn_agent"],
    });

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("Purpose", 45, 300);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "Sends an official WhatsApp interactive button message so users tap an option instead of typing.",
      45,
      320,
      { width: 320, lineGap: 4 }
    );

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("WhatsApp runtime", 45, 385);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "A tap returns the button ID. The engine stores selected_row_id and selected_row_title, then resumes along the matching port.",
      45,
      405,
      { width: 320, lineGap: 4 }
    );

    const headers = [
      { title: "Field", w: 125 },
      { title: "Type", w: 65 },
      { title: "Required", w: 65 },
      { title: "Description and example", w: 265 },
    ];
    const rows = [
      ["Header Prompt Text", "String", "Yes", "Body text above the buttons. Max 1024 chars"],
      ["Button Options", "Array", "Yes", "1 to 3 clickable buttons (min 1, max 3)"],
      ["Button ID", "String", "Yes", "Unique handle used as the edge source port. e.g. btn_sales"],
      ["Button Title", "String", "Yes", "Label shown on the button. Max 20 chars (Meta limit)"],
    ];
    drawTable(doc, 395, 110, 520, headers, rows);

    doc.roundedRect(395, 260, 520, 100, 8).fill(C_LIGHT_GREEN_BG);
    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(12).text("Validation rules", 415, 275);
    const rules = [
      "• Maximum 3 buttons: Meta Cloud API rejects more",
      "• Maximum 20 characters per button title",
      "• Every option port needs an outgoing connection (no dead ends)",
    ];
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(rules.join("\n\n"), 415, 298, { width: 480, lineGap: 3 });
  }

  // =========================================================================
  // PAGE 7: Menu List Node
  // =========================================================================
  {
    addPageHeader(doc, "Menu List node", "Interactive list: static rows or a dynamic API array", 7);

    doc.roundedRect(45, 110, 320, 160, 10).fill(C_LIGHT_GREEN_BG);
    drawNodeCard(doc, 75, 130, {
      type: "list",
      title: "Menu List",
      subtitle: "Menu · Dynamic rows",
      iconColor: COLOR_LIST,
      iconType: "list",
      bottomPorts: ["row_1", "row_2", "next (dynamic)"],
    });

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("Purpose", 45, 300);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "Shows a popup list. Static mode: up to 10 predefined rows. Dynamic mode: turns an API array such as {{api_result.products}} into up to 10 rows.",
      45,
      320,
      { width: 320, lineGap: 4 }
    );

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("Ports by mode", 45, 395);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "Static: one port per row. Dynamic: a single next port.",
      45,
      415,
      { width: 320, lineGap: 4 }
    );

    const headers = [
      { title: "Field", w: 125 },
      { title: "Mode", w: 60 },
      { title: "Req.", w: 50 },
      { title: "Description and limits", w: 285 },
    ];
    const rows = [
      ["Menu Body Text", "Both", "Yes", "Explains the list. Max 1024 chars"],
      ["Button Label", "Both", "No", "Default 'Select Option'. Max 20 chars"],
      ["Static Options", "Static", "Yes", "Up to 10 rows: id, title (max 24), description (max 72)"],
      ["Context Array Path", "Dynamic", "Yes", "Token to the array, e.g. {{api_result.data}}"],
      ["Row Title Field", "Dynamic", "Yes", "Object field used as title, e.g. product_name (cut to 24)"],
      ["Row Description / ID", "Dynamic", "No", "e.g. price (cut to 72); id (default opt_1, opt_2)"],
      ["Empty Fallback Text", "Dynamic", "No", "Sent if the array is empty"],
    ];
    drawTable(doc, 395, 105, 520, headers, rows);

    doc.roundedRect(395, 325, 520, 110, 8).fill(C_LIGHT_GREEN_BG);
    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(12).text("Validation rules", 415, 338);
    const rules = [
      "• Max 10 rows (Meta limitation)",
      "• Title up to 24 chars, description up to 72 chars",
      "• Static mode: every row port must be connected",
      "• Dynamic mode: the single next port must be connected",
    ];
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10).text(rules.join("\n\n"), 415, 360, { width: 480, lineGap: 3 });
  }

  // =========================================================================
  // PAGE 8: Ask Question Node
  // =========================================================================
  {
    addPageHeader(doc, "Ask Question node", "Captures and validates a user reply", 8);

    doc.roundedRect(45, 110, 320, 160, 10).fill(C_LIGHT_GREEN_BG);
    drawNodeCard(doc, 75, 130, {
      type: "ask",
      title: "Collect fine",
      subtitle: "Assignment · email → {{customer_email}}",
      iconColor: COLOR_ASK,
      iconType: "user",
      bottomPorts: ["next"],
    });

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("Purpose", 45, 300);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "Pauses the run, sends a prompt and waits. The reply is validated before the flow continues.",
      45,
      320,
      { width: 320, lineGap: 4 }
    );

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("Validation kinds", 45, 375);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "text: any input\nnumber: numeric only\nemail: valid syntax\ndate: YYYY-MM-DD or DD/MM/YYYY\ntime: time slot",
      45,
      395,
      { width: 320, lineGap: 3 }
    );

    const headers = [
      { title: "Field", w: 120 },
      { title: "Type", w: 75 },
      { title: "Required", w: 65 },
      { title: "Description and example", w: 260 },
    ];
    const rows = [
      ["Question Prompt", "Textarea", "Yes", "Message asking for the reply. e.g. Please provide your order number:"],
      ["Variable Name", "Identifier", "Yes", "Stores the validated answer, alphanumeric only. e.g. order_number"],
      ["Validation Kind", "Dropdown", "Yes", "One of text, number, email, date, time"],
    ];
    drawTable(doc, 395, 110, 520, headers, rows);

    doc.roundedRect(395, 235, 520, 120, 8).fill(C_LIGHT_GREEN_BG);
    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(12).text("Validation rules", 415, 250);
    const rules = [
      "• Variable name must match ^[a-zA-Z_][a-zA-Z0-9_]*$",
      "• Validation kind must be one of the 5 canonical types",
      "• The next port must connect to another node or End node",
      "• Bad replies are re-prompted, e.g. 'Please reply with a valid email address'",
    ];
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(rules.join("\n\n"), 415, 275, { width: 480, lineGap: 3 });
  }

  // =========================================================================
  // PAGE 9: Date Picker Component
  // =========================================================================
  {
    addPageHeader(doc, "Date Picker component", "Ask node with kind = date", 9);

    doc.roundedRect(45, 110, 320, 160, 10).fill(C_LIGHT_GREEN_BG);
    drawNodeCard(doc, 75, 130, {
      type: "ask",
      title: "Date Picker",
      subtitle: "Assignment · date → {{selected_date}}",
      iconColor: COLOR_DATE,
      iconType: "calendar",
      bottomPorts: ["next"],
    });

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("Purpose", 45, 300);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "A variant of Ask built for scheduling and bookings, with no native OS date widget needed.",
      45,
      320,
      { width: 320, lineGap: 4 }
    );

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("How WhatsApp renders it", 45, 380);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "An interactive list: Today, Tomorrow, the next 5 days, and a Custom Date option with a text-prompt fallback.",
      45,
      400,
      { width: 320, lineGap: 4 }
    );

    const headers = [
      { title: "Customer input", w: 220 },
      { title: "Stored value", w: 300 },
    ];
    const rows = [
      ["25/11/2026", "2026-11-25"],
      ["2026-12-09", "2026-12-09"],
      ["today / tomorrow", "The actual ISO calendar date"],
      ["31/02/2026", "Rejected with a helpful message"],
    ];
    drawTable(doc, 395, 110, 520, headers, rows);

    doc.roundedRect(395, 260, 520, 110, 8).fill(C_LIGHT_GREEN_BG);
    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(12).text("Normalization engine", 415, 275);
    const rules = [
      "• Customers can tap a list option or type custom text",
      "• Stored in both {{your_var_name}} and {{selected_date}}",
      "• Invalid dates are rejected and re-prompted",
    ];
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(rules.join("\n\n"), 415, 300, { width: 480, lineGap: 4 });
  }

  // =========================================================================
  // PAGE 10: Time Picker Component
  // =========================================================================
  {
    addPageHeader(doc, "Time Picker component", "Ask node with kind = time", 10);

    doc.roundedRect(45, 110, 320, 160, 10).fill(C_LIGHT_GREEN_BG);
    drawNodeCard(doc, 75, 130, {
      type: "ask",
      title: "Time Picker",
      subtitle: "Assignment · time → {{selected_time}}",
      iconColor: COLOR_TIME,
      iconType: "clock",
      bottomPorts: ["next"],
    });

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("Purpose", 45, 300);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "Handles slot booking and preferred-hour selection with two-tier validation.",
      45,
      320,
      { width: 320, lineGap: 4 }
    );

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("Custom time", 45, 380);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "The flow stays paused and asks: 'Please reply with your preferred time (e.g. 10:00 AM or 14:30).'",
      45,
      400,
      { width: 320, lineGap: 4 }
    );

    const headers = [
      { title: "Slot", w: 260 },
      { title: "Period", w: 260 },
    ];
    const rows = [
      ["10:00 AM - 11:00 AM", "Morning"],
      ["11:00 AM - 12:00 PM", "Morning"],
      ["02:00 PM - 03:00 PM", "Afternoon"],
      ["03:00 PM - 04:00 PM", "Afternoon"],
      ["05:00 PM - 06:00 PM", "Evening"],
      ["06:00 PM - 07:00 PM", "Evening"],
      ["Custom Time", "Prompts the user to type a time"],
    ];
    drawTable(doc, 395, 105, 520, headers, rows);

    doc.roundedRect(395, 325, 520, 95, 8).fill(C_LIGHT_GREEN_BG);
    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(12).text("parseAndNormalizeTime()", 415, 338);
    const rules = [
      "• 10 am becomes 10:00 AM; 14:30 stays 14:30",
      "• Inputs like hello or 99:99 are re-prompted automatically",
    ];
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(rules.join("\n\n"), 415, 360, { width: 480, lineGap: 4 });
  }

  // =========================================================================
  // PAGE 11: Condition Node (If / Else)
  // =========================================================================
  {
    addPageHeader(doc, "Condition node (If / Else)", "Branching decision logic without external code", 11);

    doc.roundedRect(45, 110, 320, 160, 10).fill(C_LIGHT_GREEN_BG);
    drawNodeCard(doc, 75, 130, {
      type: "condition",
      title: "Returned late?",
      subtitle: "Decision · Fine (equals)",
      iconColor: COLOR_COND,
      iconType: "fork",
      bottomPorts: ["On time", "Late"],
    });

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("Purpose", 45, 300);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "Evaluates a variable against a value with an operator and routes the conversation to the matching branch.",
      45,
      320,
      { width: 320, lineGap: 4 }
    );

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("Fields", 45, 380);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "Node Label (optional), Variable to Evaluate, Comparison Operator (one of 9), Value to Compare (conditional).",
      45,
      400,
      { width: 320, lineGap: 4 }
    );

    const headers = [
      { title: "Operator", w: 100 },
      { title: "Value?", w: 60 },
      { title: "Logic", w: 170 },
      { title: "Example", w: 190 },
    ];
    const rows = [
      ["equals", "Yes", "Case-insensitive equality", "{{response}} equals YES"],
      ["not_equals", "Yes", "Value does not match", "{{status}} not_equals CANCELLED"],
      ["contains", "Yes", "Substring is present", "{{user_reply}} contains urgent"],
      ["not_contains", "Yes", "Substring is absent", "{{email}} not_contains spam"],
      ["greater_than", "Yes", "Numeric or alphabetical", "{{order_total}} greater_than 100"],
      ["less_than", "Yes", "Numeric or alphabetical", "{{age}} less_than 18"],
      ["is_empty", "No", "Null, undefined or empty", "{{discount_code}} is_empty"],
      ["is_not_empty", "No", "Variable has a value", "{{customer_notes}} is_not_empty"],
      ["exists", "No", "Defined in context", "{{api_result}} exists"],
    ];
    drawTable(doc, 395, 105, 520, headers, rows);

    doc.roundedRect(395, 375, 520, 85, 8).fill(C_LIGHT_GREEN_BG);
    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(12).text("Validation rules", 415, 388);
    const rules = [
      "• variable and operator are mandatory",
      "• Both true and false ports must connect to child nodes",
    ];
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(rules.join("\n\n"), 415, 410, { width: 480, lineGap: 4 });
  }

  // =========================================================================
  // PAGE 12: Server API Node
  // =========================================================================
  {
    addPageHeader(doc, "Server API node", "HTTP webhooks and data mapping", 12);

    doc.roundedRect(45, 110, 320, 160, 10).fill(C_LIGHT_GREEN_BG);
    drawNodeCard(doc, 75, 130, {
      type: "api",
      title: "Server API Call",
      subtitle: "API · POST api.crm.com",
      iconColor: COLOR_API,
      iconType: "globe",
      bottomPorts: ["success", "error"],
    });

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("Purpose", 45, 300);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "Makes real-time HTTP REST calls to CRMs, ERPs, webhooks and databases during a conversation.",
      45,
      320,
      { width: 320, lineGap: 4 }
    );

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("Security and SSRF protection", 45, 380);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "Hostnames are checked against the Webhook Allowlist; unapproved hosts are rejected. A 5000 ms timeout prevents stalls.",
      45,
      400,
      { width: 320, lineGap: 4 }
    );

    const headers = [
      { title: "Field", w: 120 },
      { title: "Type", w: 75 },
      { title: "Req.", w: 50 },
      { title: "Description", w: 275 },
    ];
    const rows = [
      ["URL", "String", "Yes", "HTTP/HTTPS endpoint; supports variables, e.g. /users/{{phone}}"],
      ["HTTP Method", "Dropdown", "Yes", "GET, POST, PUT, PATCH, DELETE"],
      ["Authorization", "String", "No", "Bearer token or Basic auth header"],
      ["Body (Payload)", "JSON", "No", "Request JSON; supports {{variable}}"],
      ["Save To Variable", "Identifier", "No", "Stores the full response (default api_result)"],
      ["Field Mappings", "Key-value", "No", "Flatten fields, e.g. response.user.id to user_id"],
    ];
    drawTable(doc, 395, 105, 520, headers, rows);

    doc.roundedRect(395, 300, 520, 110, 8).fill(C_LIGHT_GREEN_BG);
    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(12).text("Validation rules", 415, 315);
    const rules = [
      "• URL must be valid HTTP/HTTPS",
      "• Both success and error ports must be connected",
      "• Host must be on the Webhook Allowlist",
    ];
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(rules.join("\n\n"), 415, 340, { width: 480, lineGap: 4 });
  }

  // =========================================================================
  // PAGE 13: End Flow Node
  // =========================================================================
  {
    addPageHeader(doc, "End Flow node", "Conversation completion", 13);

    doc.roundedRect(45, 110, 320, 160, 10).fill(C_LIGHT_GREEN_BG);
    drawNodeCard(doc, 75, 140, {
      type: "end",
      title: "Returned with fine",
      subtitle: "End · Fine",
      iconColor: COLOR_END,
      iconType: "disc",
      isPill: true,
      hasBottomHandle: false,
    });

    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(13).text("Purpose", 45, 300);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "Ends execution cleanly: marks the workflow_run as completed in the database and clears any waiting states.",
      45,
      320,
      { width: 320, lineGap: 4 }
    );

    const headers = [
      { title: "Field", w: 130 },
      { title: "Type", w: 70 },
      { title: "Required", w: 70 },
      { title: "Description and example", w: 250 },
    ];
    const rows = [
      ["Closing Message", "Textarea", "No", "Optional goodbye sent to WhatsApp. e.g. Thank you for chatting with us. Goodbye!"],
    ];
    drawTable(doc, 395, 110, 520, headers, rows);

    doc.roundedRect(395, 200, 520, 100, 8).fill(C_LIGHT_GREEN_BG);
    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(12).text("Validation rules", 415, 215);
    const rules = [
      "• Cannot have outgoing ports: it is a terminal leaf node",
      "• Must have at least one incoming connection from an ancestor node",
    ];
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(rules.join("\n\n"), 415, 240, { width: 480, lineGap: 4 });
  }

  // =========================================================================
  // PAGE 14: Master Validation Matrix
  // =========================================================================
  {
    addPageHeader(doc, "Master validation matrix", "Output ports, WhatsApp message types and Meta constraints for every node type.", 14);

    const headers = [
      { title: "Node type", w: 120 },
      { title: "Output ports", w: 160 },
      { title: "WhatsApp message type", w: 180 },
      { title: "Key Meta constraints", w: 410 },
    ];
    const rows = [
      ["Trigger", "next (1)", "None (inbound listener)", "Exactly 1 per workflow"],
      ["Message", "next (1)", "Standard text", "Non-empty text; up to 4096 chars"],
      ["Quick Buttons", "Option IDs (1-3)", "interactive (button)", "Max 3 buttons, title up to 20 chars"],
      ["Menu List", "Static option IDs or next", "interactive (list)", "Max 10 rows, title up to 24 chars"],
      ["Ask Question", "next (1)", "Text / re-prompt", "Valid variable identifier; 5 supported validation kinds"],
      ["Date Picker", "next (1)", "Interactive list (dates)", "Normalizes to ISO YYYY-MM-DD; prompt fallback"],
      ["Time Picker", "next (1)", "Interactive list (slots)", "Slots plus custom time prompt; 12h/24h parsing"],
      ["Condition", "true and false (2)", "None (internal router)", "Both branches must be connected"],
      ["Server API", "success and error (2)", "None (silent HTTP)", "Host must be on Webhook Allowlist; 5s timeout"],
      ["End Flow", "None (0)", "Optional closing text", "Terminal node; no outgoing ports allowed"],
    ];

    drawTable(doc, 45, 115, 870, headers, rows);
  }

  // =========================================================================
  // PAGE 15: Soft Delete and Record Safeguards
  // =========================================================================
  {
    addPageHeader(doc, "Soft delete and record safeguards", "Deleting a live WhatsApp agent can disrupt customers and break analytics, so both workflows and steps are protected.", 15);

    // Left Modal Card: Archive Workflow Mock
    doc.roundedRect(45, 115, 410, 200, 10).fill(C_WHITE).strokeColor("#CBD5E1").lineWidth(1).stroke();
    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(16).text("Archive Workflow", 65, 135);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(11).text('Are you sure you want to soft delete "Appointment Flow"?', 65, 165);

    // Inner details box
    doc.roundedRect(65, 195, 370, 65, 6).fill(C_LIGHT_GREEN_BG);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(9.5).text(
      "Status: active (v2)\nTrigger keywords: book, appointment, schedule\nMoved to archived: stops replying, history is preserved.",
      75,
      205,
      { width: 350, lineGap: 3 }
    );

    // Modal Buttons
    doc.roundedRect(260, 275, 75, 26, 4).fill("#FFFFFF").strokeColor("#CBD5E1").lineWidth(1).stroke();
    doc.fillColor(C_TEXT_BODY).font("Helvetica-Bold").fontSize(10).text("Cancel", 260, 283, { width: 75, align: "center" });

    doc.roundedRect(345, 275, 90, 26, 4).fill("#DC2626");
    doc.fillColor(C_WHITE).font("Helvetica-Bold").fontSize(10).text("Archive Workflow", 345, 283, { width: 90, align: "center" });

    // Left Bottom: Step and Node Level Guard
    doc.roundedRect(45, 335, 410, 130, 10).fill(C_LIGHT_GREEN_BG);
    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(12.5).text("Step and node level (canvas guard)", 65, 350);
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(10.5).text(
      "Clicking Delete Step in the Inspector Panel opens a confirmation popup. It warns that all incoming and outgoing edges on that step will be disconnected, preventing unintended canvas breakage.",
      65,
      375,
      { width: 370, lineGap: 4 }
    );

    // Right Side: Workflow Level Archiving
    doc.roundedRect(485, 115, 430, 350, 12).fill(C_LIGHT_GREEN_BG);
    doc.fillColor(C_TEXT_TITLE).font("Helvetica-Bold").fontSize(14).text("Workflow level (archiving)", 510, 140);
    const wfRules = [
      "• The trash icon on a workflow card opens a modal with its name, status and trigger keywords",
      "• Confirming calls DELETE /api/workflows/[id], a soft delete that sets status = 'archived' and refreshes updated_at",
      "• The workflow leaves active agent listings, but no database records are purged",
      "• Past workflow_runs, workflow_audit_logs and customer message histories stay intact",
      "• Restore to draft any time with POST /api/workflows/[id]/restore",
    ];
    doc.fillColor(C_TEXT_BODY).font("Helvetica").fontSize(11).text(wfRules.join("\n\n"), 510, 175, { width: 380, lineGap: 5 });
  }

  // End Document
  doc.end();

  stream.on("finish", () => {
    // Copy to root and brain directory
    fs.copyFileSync(outputPath, rootPath);
    try {
      fs.copyFileSync(outputPath, brainPath);
    } catch {}
    console.log(`PDF successfully generated at:\n- ${outputPath}\n- ${rootPath}\n- ${brainPath}`);
  });
}

createPdf();
