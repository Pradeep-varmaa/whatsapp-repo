import { executeQuery, sql } from "@/server/database/connection";
import { MessagingService } from "@/server/services/messagingService";
import { interpolateString, resolveVariable, resolveValue } from "./variableInterpolator";
import {
  parseAndNormalizeDate,
  parseAndNormalizeTime,
  resolveTimeSlotLabel,
  isCustomTimeSlot,
} from "./dateUtils";
import { isHostAllowed as checkHostAllowed } from "@/server/security/webhookAllowlist";
import { WorkflowGraph, WorkflowNode, WorkflowRunStatus, ASK_KINDS, AskKind, ConditionOperator, FlowCallFrame, GotoFlowMode } from "./types";
import { logger } from "@/server/security/logger";

const messagingService = new MessagingService();

const MAX_STEPS = 50;
const API_TIMEOUT_MS = 5000;
const MAX_RESPONSE_SIZE = 100 * 1024; // 100 KB

export interface StartRunParams {
  workflowId: string;
  workflowVersion: number;
  projectId: string;
  phoneNumberId: string | null;
  customerPhone: string;
  initialContext?: Record<string, any>;
  triggerText?: string;
}

export interface ResumeRunParams {
  runId: string;
  replyText: string;
  replyId?: string | null; // Selected button or list row ID
}

export class FlowRunner {
  /**
   * Start a new workflow run
   */
  static async startRun(params: StartRunParams): Promise<void> {
    const { workflowId, workflowVersion, projectId, phoneNumberId, customerPhone, initialContext, triggerText } = params;

    // Load workflow graph
    const rows = await executeQuery<any>(
      `SELECT id, name, version, graph_json FROM workflows WHERE id = @id`,
      { id: { type: sql.NVarChar(64), value: workflowId } }
    );

    if (!rows || rows.length === 0) {
      logger.error(`[FlowRunner] Workflow ${workflowId} not found.`);
      return;
    }

    const currentWorkflow = {
      id: rows[0].id || workflowId,
      name: rows[0].name || "Workflow",
      version: rows[0].version || workflowVersion,
    };

    const graph: WorkflowGraph = JSON.parse(rows[0].graph_json);
    const triggerNode = graph.nodes.find((n) => n.type === "trigger");
    if (!triggerNode) {
      logger.error(`[FlowRunner] Workflow ${workflowId} has no trigger node.`);
      return;
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours TTL
    // Clean customer phone format
    const cleanPhone = customerPhone.replace(/\D/g, "");

    const context: Record<string, any> = {
      customer_phone: customerPhone,
      phone: customerPhone,
      sender_phone: customerPhone,
      mobile: customerPhone,
      clean_phone: cleanPhone,
      trigger_text: triggerText || "",
      ...(initialContext || {}),
    };

    try {
      await executeQuery(
        `INSERT INTO workflow_runs (id, workflow_id, workflow_version, project_id, phone_number_id, customer_phone, current_node_id, status, context_json, step_count, expires_at, created_at, updated_at)
         VALUES (@id, @wfId, @version, @projId, @phoneId, @customerPhone, @nodeId, 'running', @contextJson, 0, @expiresAt, SYSUTCDATETIME(), SYSUTCDATETIME())`,
        {
          id: { type: sql.NVarChar(64), value: runId },
          wfId: { type: sql.NVarChar(64), value: workflowId },
          version: { type: sql.Int, value: workflowVersion },
          projId: { type: sql.NVarChar(64), value: projectId },
          phoneId: { type: sql.NVarChar(64), value: phoneNumberId || null },
          customerPhone: { type: sql.NVarChar(50), value: cleanPhone },
          nodeId: { type: sql.NVarChar(64), value: triggerNode.id },
          contextJson: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(context) },
          expiresAt: { type: sql.DateTime2, value: new Date(expiresAt) },
        }
      );
    } catch (insertErr: any) {
      logger.warn(`[FlowRunner] Could not start run for customer ${cleanPhone}: ${insertErr.message}`);
      return;
    }

    await this.recordAudit(runId, triggerNode.id, "run_started", {
      workflowId,
      customerPhone: cleanPhone,
      triggerText,
    });

    // Find the next node connected to Trigger's "next" port
    const firstEdge = graph.edges.find((e) => e.from === triggerNode.id && e.port === "next");
    if (!firstEdge) {
      await this.completeRun(runId, context, "No next node connected to trigger.");
      return;
    }

    const firstNode = graph.nodes.find((n) => n.id === firstEdge.to);
    if (!firstNode) {
      await this.failRun(runId, triggerNode.id, `Target node ${firstEdge.to} not found.`);
      return;
    }

    await this.executeStep(runId, currentWorkflow, graph, firstNode, context, 1, projectId, phoneNumberId, cleanPhone);
  }

  /**
   * Resume an existing run that was in 'waiting_reply' status
   */
  static async resumeRun(params: ResumeRunParams): Promise<void> {
    const { runId, replyText, replyId } = params;

    const rows = await executeQuery<any>(
      `SELECT r.id, r.workflow_id, r.workflow_version, r.project_id, r.phone_number_id,
              r.customer_phone, r.current_node_id, r.status, r.context_json, r.step_count,
              r.expires_at, w.name AS workflow_name, w.graph_json
       FROM workflow_runs r
       INNER JOIN workflows w ON r.workflow_id = w.id
       WHERE r.id = @id`,
      { id: { type: sql.NVarChar(64), value: runId } }
    );

    if (!rows || rows.length === 0) return;
    const run = rows[0];

    // Check expiry
    if (run.expires_at && new Date(run.expires_at).getTime() < Date.now()) {
      await this.updateRunStatus(runId, "expired");
      await this.recordAudit(runId, run.current_node_id, "run_expired", { reason: "24-hour window expired" });
      return;
    }

    if (run.status !== "waiting_reply") {
      logger.warn(`[FlowRunner] Run ${runId} is in status "${run.status}", not "waiting_reply". Ignoring.`);
      return;
    }

    const graph: WorkflowGraph = JSON.parse(run.graph_json);
    const currentNode = graph.nodes.find((n) => n.id === run.current_node_id);
    if (!currentNode) {
      await this.failRun(runId, null, `Current node "${run.current_node_id}" not found in graph.`);
      return;
    }

    const context: Record<string, any> = JSON.parse(run.context_json || "{}");
    const stepCount = (run.step_count || 0) + 1;

    await this.recordAudit(runId, currentNode.id, "reply_received", {
      replyText,
      replyId: replyId || null,
    });

    let nextNodeId: string | null = null;

    if (currentNode.type === "buttons" || currentNode.type === "list") {
      const selectedId = replyId || replyText.trim();
      const selectedTitle = replyText.trim();

      const saveIdVar = currentNode.data?.save_row_id_to || "selected_row_id";
      const saveTitleVar = currentNode.data?.save_row_title_to || "selected_row_title";

      context[saveIdVar] = selectedId;
      context[saveTitleVar] = selectedTitle;
      context["selected_row_id"] = selectedId;
      context["selected_row_title"] = selectedTitle;

      // Extract date and time if selected option relates to date/time
      const lowerId = selectedId.toLowerCase();
      const lowerTitle = selectedTitle.toLowerCase();
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const todayISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowISO = `${tomorrowDate.getFullYear()}-${pad(tomorrowDate.getMonth() + 1)}-${pad(tomorrowDate.getDate())}`;

      if (lowerId.includes("today") || lowerTitle.includes("today")) {
        context["selected_date"] = todayISO;
        context["selected_date_label"] = interpolateString("{{$today}}", context);
      } else if (lowerId.includes("tomorrow") || lowerTitle.includes("tomorrow")) {
        context["selected_date"] = tomorrowISO;
        context["selected_date_label"] = interpolateString("{{$tomorrow}}", context);
      } else if (lowerId.includes("selected_date") || lowerTitle.includes("selected date") || lowerTitle.includes("pick date")) {
        context["selected_date"] = "selected_date";
        context["selected_date_label"] = "Selected Date";
      }

      const timeMatch = selectedTitle.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)(?:\s*-\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))?/i);
      if (timeMatch) {
        context["selected_time"] = timeMatch[0];
      } else if (lowerId.includes("morning") || lowerTitle.includes("morning")) {
        context["selected_time"] = "10:00 AM - 01:00 PM";
      } else if (lowerId.includes("afternoon") || lowerTitle.includes("afternoon")) {
        context["selected_time"] = "02:00 PM - 05:00 PM";
      } else if (lowerId.includes("evening") || lowerTitle.includes("evening")) {
        context["selected_time"] = "06:00 PM - 09:00 PM";
      }

      // If dynamic rows was used, find the matched item and store in context
      if (currentNode.data?.is_dynamic && currentNode.data?.array_path) {
        const rawArr = resolveValue(currentNode.data.array_path, context);
        let arrToSearch: any[] = [];
        if (Array.isArray(rawArr)) {
          arrToSearch = rawArr;
        } else if (rawArr && typeof rawArr === "object") {
          if (Array.isArray(rawArr.products)) arrToSearch = rawArr.products;
          else if (Array.isArray(rawArr.data)) arrToSearch = rawArr.data;
          else if (Array.isArray(rawArr.items)) arrToSearch = rawArr.items;
          else if (Array.isArray(rawArr.results)) arrToSearch = rawArr.results;
          else if (Array.isArray(rawArr.response)) arrToSearch = rawArr.response;
          else {
            const foundArr = Object.values(rawArr).find(Array.isArray);
            if (foundArr) arrToSearch = foundArr as any[];
          }
        }
        if (arrToSearch.length > 0) {
          const matchedItem = arrToSearch.find((item: any, idx: number) => {
            const itemId = String(item?.id ?? item?._id ?? item?.key ?? `opt_${idx + 1}`);
            const itemTitle = String(item?.title ?? item?.name ?? item?.product_name ?? item?.label ?? "");
            return itemId === selectedId || itemTitle === selectedTitle || itemId === String(selectedTitle);
          });
          if (matchedItem) {
            context["selected_row"] = matchedItem;
          }
        }
      }

      await this.recordAudit(runId, currentNode.id, "option_selected", {
        selected_row_id: selectedId,
        selected_row_title: selectedTitle,
      });

      // Find matching edge by selected button/list ID, or fallback to matching reply text or next/default edge
      const selectedPort = selectedId;
      const isDynamic = Boolean(currentNode.data?.is_dynamic || currentNode.data?.dynamicRows);
      const edge =
        graph.edges.find((e) => e.from === currentNode.id && e.port === selectedPort) ||
        graph.edges.find((e) => e.from === currentNode.id && e.port.toLowerCase() === selectedPort.toLowerCase()) ||
        graph.edges.find((e) => e.from === currentNode.id && (e.port === "next" || e.port === "default" || e.port === "selected")) ||
        (isDynamic ? graph.edges.find((e) => e.from === currentNode.id) : undefined);

      if (!edge) {
        // Did not match an option port, prompt again
        await messagingService.sendMessage({
          projectId: run.project_id,
          phoneNumberId: run.phone_number_id || undefined,
          recipientPhone: run.customer_phone,
          messageType: "text",
          contentText: "Please select one of the provided options from the menu.",
        });
        return;
      }
      nextNodeId = edge.to;
    } else if (currentNode.type === "ask") {
      const data = currentNode.data || {};
      const varName = data.var || "response";
      const kind = data.kind || "text";

      // Input validation by kind
      const cleanInput = replyText.trim();
      if (kind === "number") {
        if (!/^-?\d+(\.\d+)?$/.test(cleanInput)) {
          await messagingService.sendMessage({
            projectId: run.project_id,
            phoneNumberId: run.phone_number_id || undefined,
            recipientPhone: run.customer_phone,
            messageType: "text",
            contentText: "Please reply with a valid numeric value.",
          });
          return;
        }
        context[varName] = Number(cleanInput);
      } else if (kind === "email") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanInput)) {
          await messagingService.sendMessage({
            projectId: run.project_id,
            phoneNumberId: run.phone_number_id || undefined,
            recipientPhone: run.customer_phone,
            messageType: "text",
            contentText: "Please reply with a valid email address.",
          });
          return;
        }
        context[varName] = cleanInput;
      } else if (kind === "date") {
        const inputToParse = replyId?.startsWith("opt_date_")
          ? replyId.replace("opt_date_", "")
          : (replyId === "opt_today" ? "today" : (replyId === "opt_tomorrow" ? "tomorrow" : cleanInput));

        const normalizedDate = parseAndNormalizeDate(inputToParse);
        if (!normalizedDate) {
          await messagingService.sendMessage({
            projectId: run.project_id,
            phoneNumberId: run.phone_number_id || undefined,
            recipientPhone: run.customer_phone,
            messageType: "text",
            contentText: "Please reply with a valid date (e.g. 25/11/2026 or YYYY-MM-DD).",
          });
          return;
        }

        context[varName] = normalizedDate;
        context["selected_date"] = normalizedDate;
        context["selected_date_label"] = cleanInput;
      } else if (kind === "time") {
        // Case 1: user selected a pre-defined slot from the interactive list
        const slotLabel = resolveTimeSlotLabel(replyId);
        if (slotLabel) {
          context[varName] = slotLabel;
          context["selected_time"] = slotLabel;
        } else if (isCustomTimeSlot(replyId)) {
          // Case 2: user selected "Custom Time" — ask them to type the time
          await messagingService.sendMessage({
            projectId: run.project_id,
            phoneNumberId: run.phone_number_id || undefined,
            recipientPhone: run.customer_phone,
            messageType: "text",
            contentText: "Please reply with your preferred time (e.g. 10:00 AM or 14:30).",
          });
          // Stay waiting on the same ask node — do NOT advance
          await this.setWaitingReply(runId, currentNode.id, context, stepCount);
          return;
        } else {
          // Case 3: free-text time — validate the format
          const normalizedTime = parseAndNormalizeTime(cleanInput);
          if (!normalizedTime) {
            await messagingService.sendMessage({
              projectId: run.project_id,
              phoneNumberId: run.phone_number_id || undefined,
              recipientPhone: run.customer_phone,
              messageType: "text",
              contentText:
                "Please reply with a valid time (e.g. 10:00 AM, 2:30 PM, or 14:30).",
            });
            return;
          }
          context[varName] = normalizedTime;
          context["selected_time"] = normalizedTime;
        }
      } else {
        context[varName] = cleanInput;
      }

      await this.recordAudit(runId, currentNode.id, "variable_set", {
        var: varName,
        value: context[varName],
      });

      const nextEdge = graph.edges.find((e) => e.from === currentNode.id && e.port === "next");
      nextNodeId = nextEdge?.to || null;
    }

    if (!nextNodeId) {
      await this.completeRun(runId, context, "Flow ended naturally.");
      return;
    }

    const nextNode = graph.nodes.find((n) => n.id === nextNodeId);
    if (!nextNode) {
      await this.failRun(runId, currentNode.id, `Target node ${nextNodeId} not found.`);
      return;
    }

    const currentWorkflow = {
      id: run.workflow_id,
      name: run.workflow_name || "Workflow",
      version: run.workflow_version,
    };

    await this.executeStep(
      runId,
      currentWorkflow,
      graph,
      nextNode,
      context,
      stepCount,
      run.project_id,
      run.phone_number_id,
      run.customer_phone
    );
  }

  /**
   * Core node execution loop
   */
  private static async executeStep(
    runId: string,
    currentWorkflow: { id: string; name: string; version: number },
    graph: WorkflowGraph,
    node: WorkflowNode,
    context: Record<string, any>,
    stepCount: number,
    projectId: string,
    phoneNumberId: string | null,
    customerPhone: string
  ): Promise<void> {
    if (stepCount > MAX_STEPS) {
      await this.failRun(runId, node.id, `Step limit exceeded (${MAX_STEPS} steps max). Possible infinite loop.`);
      return;
    }

    await this.recordAudit(runId, node.id, "node_start", { type: node.type });

    // Update current position in DB
    await executeQuery(
      `UPDATE workflow_runs
       SET workflow_id = @wfId,
           workflow_version = @version,
           current_node_id = @nodeId,
           step_count = @stepCount,
           context_json = @contextJson,
           status = 'running',
           updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      {
        id: { type: sql.NVarChar(64), value: runId },
        wfId: { type: sql.NVarChar(64), value: currentWorkflow.id },
        version: { type: sql.Int, value: currentWorkflow.version },
        nodeId: { type: sql.NVarChar(64), value: node.id },
        stepCount: { type: sql.Int, value: stepCount },
        contextJson: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(context) },
      }
    );

    switch (node.type) {
      case "message": {
        const text = interpolateString(node.data?.text || "", context);
        try {
          await messagingService.sendMessage({
            projectId,
            phoneNumberId: phoneNumberId || undefined,
            recipientPhone: customerPhone,
            messageType: "text",
            contentText: text,
          });
          await this.recordAudit(runId, node.id, "message_sent", { text });
        } catch (err: any) {
          logger.error(`[FlowRunner] Send message failed at node ${node.id}:`, err.message);
        }

        const nextEdge = graph.edges.find((e) => e.from === node.id && e.port === "next");
        if (nextEdge) {
          const nextNode = graph.nodes.find((n) => n.id === nextEdge.to);
          if (nextNode) {
            await this.executeStep(runId, currentWorkflow, graph, nextNode, context, stepCount + 1, projectId, phoneNumberId, customerPhone);
            return;
          }
        }
        await this.completeRun(runId, context, "Workflow finished after message.");
        break;
      }

      case "buttons": {
        const text = interpolateString(node.data?.text || "", context);
        const opts = (node.data?.opts || []).map((o: any) => ({
          id: o.id,
          title: interpolateString(o.title || "", context),
        }));

        try {
          await messagingService.sendInteractiveButtons({
            projectId,
            phoneNumberId,
            recipientPhone: customerPhone,
            text,
            buttons: opts,
          });
          await this.recordAudit(runId, node.id, "buttons_sent", { text, buttonCount: opts.length });
        } catch (err: any) {
          logger.error(`[FlowRunner] Send buttons failed at node ${node.id}:`, err.message);
        }

        // Set to waiting for customer reply
        await this.setWaitingReply(runId, node.id, context, stepCount);
        break;
      }

      case "list": {
        const text = interpolateString(node.data?.text || "", context);
        const buttonText = (interpolateString(node.data?.buttonText || "Select Option", context) || "Select Option").slice(0, 20);
        const isDynamic = Boolean(node.data?.is_dynamic || node.data?.dynamicRows);

        let rows: Array<{ id: string; title: string; description?: string }> = [];

        if (isDynamic) {
          const rawArray = resolveValue(node.data?.array_path || "", context);
          let items: any[] = [];
          if (Array.isArray(rawArray)) {
            items = rawArray;
          } else if (rawArray && typeof rawArray === "object") {
            if (Array.isArray(rawArray.products)) items = rawArray.products;
            else if (Array.isArray(rawArray.data)) items = rawArray.data;
            else if (Array.isArray(rawArray.items)) items = rawArray.items;
            else if (Array.isArray(rawArray.results)) items = rawArray.results;
            else if (Array.isArray(rawArray.response)) items = rawArray.response;
            else {
              const foundArr = Object.values(rawArray).find(Array.isArray);
              if (foundArr) items = foundArr as any[];
            }
          }

          if (items.length === 0) {
            // Fall back to a plain text message if the array is empty
            const fallbackText = interpolateString(
              node.data?.empty_fallback_text ||
              node.data?.empty_message ||
              node.data?.text ||
              "No options are currently available at this time.",
              context
            );

            try {
              await messagingService.sendMessage({
                projectId,
                phoneNumberId: phoneNumberId || undefined,
                recipientPhone: customerPhone,
                messageType: "text",
                contentText: fallbackText,
              });
              await this.recordAudit(runId, node.id, "list_empty_fallback", { fallbackText });
            } catch (err: any) {
              logger.error(`[FlowRunner] Send empty fallback message failed at node ${node.id}:`, err.message);
            }

            // Move to next step if connected, otherwise complete flow
            const emptyEdge =
              graph.edges.find((e) => e.from === node.id && (e.port === "empty" || e.port === "next" || e.port === "default"));
            if (emptyEdge) {
              const nextNode = graph.nodes.find((n) => n.id === emptyEdge.to);
              if (nextNode) {
                await this.executeStep(runId, currentWorkflow, graph, nextNode, context, stepCount + 1, projectId, phoneNumberId, customerPhone);
                return;
              }
            }
            await this.completeRun(runId, context, "Workflow finished after empty list fallback.");
            break;
          }

          const seenIds = new Set<string>();
          rows = items.slice(0, 10).map((item: any, idx: number) => {
            const itemContext = { ...context, item, index: idx, idx: idx + 1 };
            const resolveField = (fieldStr?: string) => {
              if (!fieldStr) return "";
              const trimmed = fieldStr.trim();
              if (trimmed.includes("{{")) return interpolateString(trimmed, itemContext);
              if (item && typeof item === "object") {
                const val = resolveValue(trimmed, item);
                if (val !== undefined && val !== null) {
                  return typeof val === "object" ? JSON.stringify(val) : String(val);
                }
              }
              return resolveVariable(trimmed, itemContext);
            };

            const rawTitle = resolveField(node.data?.title_field) || String(item?.title ?? item?.name ?? item?.product_name ?? item?.label ?? item?.ip_address ?? `Option ${idx + 1}`);
            const rawDesc = resolveField(node.data?.description_field) || (item?.description ? String(item.description) : (item?.category ? String(item.category) : undefined));
            const rawId = resolveField(node.data?.id_field) || String(item?.id ?? item?._id ?? item?.key ?? item?.sku ?? `opt_${idx + 1}`);

            let finalId = rawId || `row_${idx + 1}`;
            if (seenIds.has(finalId)) {
              finalId = `${finalId}_${idx + 1}`;
            }
            seenIds.add(finalId);

            return {
              id: finalId,
              title: (rawTitle || `Option ${idx + 1}`).slice(0, 24),
              description: rawDesc ? rawDesc.slice(0, 72) : undefined,
            };
          });
        } else {
          const seenIds = new Set<string>();
          rows = (node.data?.opts || []).slice(0, 10).map((o: any, idx: number) => {
            const rawTitle = interpolateString(o.title || "", context) || `Option ${idx + 1}`;
            const rawDesc = o.description ? interpolateString(o.description, context) : undefined;
            let finalId = o.id || `opt_${idx + 1}`;
            if (seenIds.has(finalId)) {
              finalId = `${finalId}_${idx + 1}`;
            }
            seenIds.add(finalId);

            return {
              id: finalId,
              title: rawTitle.slice(0, 24),
              description: rawDesc ? rawDesc.slice(0, 72) : undefined,
            };
          });
        }

        try {
          await messagingService.sendInteractiveList({
            projectId,
            phoneNumberId,
            recipientPhone: customerPhone,
            text,
            buttonText,
            sections: [{ title: "Options", rows }],
          });
          await this.recordAudit(runId, node.id, "list_sent", { text, rowCount: rows.length });
        } catch (err: any) {
          logger.error(`[FlowRunner] Send list failed at node ${node.id}:`, err.message);
        }

        await this.setWaitingReply(runId, node.id, context, stepCount);
        break;
      }

      case "ask": {
        const text = interpolateString(node.data?.text || "", context);
        const kind = node.data?.kind || "text";

        if (kind === "date") {
          // Send WhatsApp Interactive List message for Date Selection
          const now = new Date();
          const pad = (n: number) => String(n).padStart(2, "0");
          const weekdayFmt = new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          });

          const rows = [
            {
              id: "opt_today",
              title: `Today (${weekdayFmt.format(now)})`.slice(0, 24),
              description: "",
            },
            {
              id: "opt_tomorrow",
              title: `Tomorrow (${weekdayFmt.format(new Date(now.getTime() + 24 * 3600 * 1000))})`.slice(0, 24),
              description: "",
            },
          ];

          for (let i = 2; i <= 6; i++) {
            const nextDay = new Date(now.getTime() + i * 24 * 3600 * 1000);
            const iso = `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}`;
            rows.push({
              id: `opt_date_${iso}`,
              title: weekdayFmt.format(nextDay).slice(0, 24),
              description: `Date: ${iso}`,
            });
          }

          rows.push({
            id: "opt_custom_date",
            title: "📅 Custom Date",
            description: "Reply with custom YYYY-MM-DD",
          });

          try {
            await messagingService.sendInteractiveList({
              projectId,
              phoneNumberId,
              recipientPhone: customerPhone,
              text: text || "Please select your convenient date:",
              buttonText: "Select Date",
              sections: [{ title: "Available Dates", rows }],
            });
            await this.recordAudit(runId, node.id, "date_list_sent", { text, rowCount: rows.length });
          } catch (err: any) {
            logger.error(`[FlowRunner] Send date list failed at node ${node.id}:`, err.message);
            await messagingService.sendMessage({
              projectId,
              phoneNumberId: phoneNumberId || undefined,
              recipientPhone: customerPhone,
              messageType: "text",
              contentText: text ? `${text}\n\nReply with a date, e.g. 25/11/2026` : "Reply with a date, e.g. 25/11/2026",
            });
          }
        } else if (kind === "time") {
          // Send WhatsApp Interactive List message for Time Slot Selection
          const rows = [
            { id: "slot_10am", title: "10:00 AM - 11:00 AM", description: "Morning slot" },
            { id: "slot_11am", title: "11:00 AM - 12:00 PM", description: "Morning slot" },
            { id: "slot_02pm", title: "02:00 PM - 03:00 PM", description: "Afternoon slot" },
            { id: "slot_03pm", title: "03:00 PM - 04:00 PM", description: "Afternoon slot" },
            { id: "slot_05pm", title: "05:00 PM - 06:00 PM", description: "Evening slot" },
            { id: "slot_06pm", title: "06:00 PM - 07:00 PM", description: "Evening slot" },
            { id: "slot_custom", title: "⏰ Custom Time", description: "Reply with your time slot" },
          ];

          try {
            await messagingService.sendInteractiveList({
              projectId,
              phoneNumberId,
              recipientPhone: customerPhone,
              text: text || "Please select your preferred time slot:",
              buttonText: "Select Time Slot",
              sections: [{ title: "Available Time Slots", rows }],
            });
            await this.recordAudit(runId, node.id, "time_list_sent", { text, rowCount: rows.length });
          } catch (err: any) {
            logger.error(`[FlowRunner] Send time list failed at node ${node.id}:`, err.message);
            await messagingService.sendMessage({
              projectId,
              phoneNumberId: phoneNumberId || undefined,
              recipientPhone: customerPhone,
              messageType: "text",
              contentText: `${text}\n\n(Reply with your preferred time slot)`,
            });
          }
        } else {
          try {
            await messagingService.sendMessage({
              projectId,
              phoneNumberId: phoneNumberId || undefined,
              recipientPhone: customerPhone,
              messageType: "text",
              contentText: text,
            });
            await this.recordAudit(runId, node.id, "question_asked", { text, var: node.data?.var });
          } catch (err: any) {
            logger.error(`[FlowRunner] Ask prompt failed at node ${node.id}:`, err.message);
          }
        }

        await this.setWaitingReply(runId, node.id, context, stepCount);
        break;
      }

      case "api": {
        const rawUrl = interpolateString(node.data?.url || "", context);
        const method = (node.data?.method || "GET").toUpperCase();
        const saveVar = node.data?.save;

        let parsedUrl: URL;
        try {
          parsedUrl = new URL(rawUrl);
        } catch {
          await this.recordAudit(runId, node.id, "api_error", { error: `Invalid URL: ${rawUrl}` });
          await this.followPort(runId, currentWorkflow, graph, node.id, "error", context, stepCount, projectId, phoneNumberId, customerPhone);
          return;
        }

        // Host Allowlist check
        const isAllowed = await this.isHostAllowed(parsedUrl.hostname, projectId);
        if (!isAllowed) {
          const errDetail = `Host "${parsedUrl.hostname}" is not allowlisted in Webhook Allowlist.`;
          logger.warn(`[FlowRunner] API Node SSRF block: ${errDetail}`);
          await this.recordAudit(runId, node.id, "api_blocked", { hostname: parsedUrl.hostname, reason: "Host not allowlisted" });
          await this.followPort(runId, currentWorkflow, graph, node.id, "error", context, stepCount, projectId, phoneNumberId, customerPhone);
          return;
        }

        let apiSuccess = false;
        let responseJson: any = null;

        try {
          const headers: Record<string, string> = {
            "Content-Type": node.data?.contentType || "application/json",
            "User-Agent": "WAEngine-WorkflowRunner/1.0",
          };

          if (node.data?.authorization) {
            headers["Authorization"] = interpolateString(String(node.data.authorization), context);
          }

          if (node.data?.headers) {
            for (const [k, v] of Object.entries(node.data.headers)) {
              headers[k] = interpolateString(String(v), context);
            }
          }

          let body: string | undefined = undefined;
          if (["POST", "PUT", "PATCH"].includes(method) && node.data?.body) {
            body = interpolateString(node.data.body, context);
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

          const res = await fetch(parsedUrl.toString(), {
            method,
            headers,
            body,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          const responseText = await res.text();
          const cappedText = responseText.slice(0, MAX_RESPONSE_SIZE);

          try {
            responseJson = JSON.parse(cappedText);
          } catch {
            responseJson = { raw: cappedText };
          }

          if (res.ok) {
            apiSuccess = true;
            if (saveVar) {
              context[saveVar] = responseJson;
            }
            // Preserve node-isolated responses so later steps or audits can reference api_<nodeId> directly without overwrites
            context[`api_${node.id}`] = responseJson;
            context[`__node_${node.id}`] = responseJson;

            // Also merge top-level JSON fields into context for direct access: {{key}} and {{saveVar.key}}
            if (responseJson && typeof responseJson === "object" && !Array.isArray(responseJson)) {
              for (const [k, v] of Object.entries(responseJson)) {
                if (!(k in context)) {
                  context[k] = v;
                }
              }
            }

            // Apply explicit field mappings if configured (e.g. status -> order_status)
            if (Array.isArray(node.data?.mappings)) {
              for (const m of node.data.mappings) {
                if (m.from && m.to) {
                  const val = resolveVariable(m.from, responseJson);
                  if (val !== undefined && val !== "") {
                    context[m.to.trim()] = val;
                  }
                }
              }
            }
          }

          await this.recordAudit(runId, node.id, apiSuccess ? "api_success" : "api_http_error", {
            method,
            url: parsedUrl.toString(),
            httpStatus: res.status,
            saveVar: saveVar || null,
          });
        } catch (fetchErr: any) {
          logger.error(`[FlowRunner] API call failed: ${fetchErr.message}`);
          await this.recordAudit(runId, node.id, "api_network_error", {
            method,
            url: parsedUrl.toString(),
            error: fetchErr.message,
          });
        }

        const port = apiSuccess ? "success" : "error";
        await this.followPort(runId, currentWorkflow, graph, node.id, port, context, stepCount, projectId, phoneNumberId, customerPhone);
        break;
      }

      case "condition": {
        const variable = node.data?.variable || "";
        const operator = (node.data?.operator || "equals") as ConditionOperator;
        const targetValue = interpolateString(String(node.data?.value ?? ""), context);

        const actualValue = resolveValue(variable, context);

        let result = false;
        const strActual = actualValue !== null && actualValue !== undefined ? String(actualValue).trim() : "";
        const strTarget = String(targetValue ?? "").trim();

        switch (operator) {
          case "equals":
            result = strActual.toLowerCase() === strTarget.toLowerCase();
            break;
          case "not_equals":
            result = strActual.toLowerCase() !== strTarget.toLowerCase();
            break;
          case "contains":
            result = strActual.toLowerCase().includes(strTarget.toLowerCase());
            break;
          case "not_contains":
            result = !strActual.toLowerCase().includes(strTarget.toLowerCase());
            break;
          case "greater_than": {
            const numA = parseFloat(strActual);
            const numB = parseFloat(strTarget);
            result = !isNaN(numA) && !isNaN(numB) ? numA > numB : strActual > strTarget;
            break;
          }
          case "less_than": {
            const numA = parseFloat(strActual);
            const numB = parseFloat(strTarget);
            result = !isNaN(numA) && !isNaN(numB) ? numA < numB : strActual < strTarget;
            break;
          }
          case "is_empty":
            result = actualValue === null || actualValue === undefined || strActual === "";
            break;
          case "is_not_empty":
            result = actualValue !== null && actualValue !== undefined && strActual !== "";
            break;
          case "exists":
            result = actualValue !== undefined && actualValue !== null;
            break;
          default:
            result = false;
        }

        await this.recordAudit(runId, node.id, "condition_evaluated", {
          variable,
          operator,
          targetValue: strTarget,
          actualValue: strActual,
          result,
        });

        const branchPort = result ? "true" : "false";
        await this.followPort(runId, currentWorkflow, graph, node.id, branchPort, context, stepCount, projectId, phoneNumberId, customerPhone);
        break;
      }

      case "goto_flow": {
        const targetFlowId = node.data?.target_flow_id;
        const mode: GotoFlowMode = node.data?.mode || "handoff";
        const entryNodeId = node.data?.entry_node_id;

        if (!targetFlowId) {
          await this.recordAudit(runId, node.id, "goto_flow_error", {
            error: "No target_flow_id specified on goto_flow node.",
            sourceFlowId: currentWorkflow.id,
          });
          if (mode === "subflow") {
            await this.followPort(runId, currentWorkflow, graph, node.id, "error", context, stepCount, projectId, phoneNumberId, customerPhone);
          } else {
            await this.failRun(runId, node.id, "Target flow not specified.");
          }
          break;
        }

        // Check max call depth of 5
        const callStack: FlowCallFrame[] = Array.isArray(context._call_stack) ? context._call_stack : [];
        if (mode === "subflow" && callStack.length >= 5) {
          logger.warn(`[FlowRunner] Max subflow depth of 5 reached for run ${runId}`);
          await this.recordAudit(runId, node.id, "subflow_depth_exceeded", {
            error: "Max subflow call depth of 5 exceeded.",
            sourceFlowId: currentWorkflow.id,
            sourceFlowName: currentWorkflow.name,
            targetFlowId,
            currentDepth: callStack.length,
          });
          await this.followPort(runId, currentWorkflow, graph, node.id, "error", context, stepCount, projectId, phoneNumberId, customerPhone);
          break;
        }

        // Fetch target flow
        const targetRows = await executeQuery<any>(
          `SELECT id, name, version, status, project_id, graph_json FROM workflows WHERE id = @id`,
          { id: { type: sql.NVarChar(64), value: targetFlowId } }
        );

        if (!targetRows || targetRows.length === 0) {
          logger.error(`[FlowRunner] Target flow ${targetFlowId} not found.`);
          await this.recordAudit(runId, node.id, "goto_flow_error", {
            error: `Target flow ${targetFlowId} not found.`,
            sourceFlowId: currentWorkflow.id,
            targetFlowId,
          });
          if (mode === "subflow") {
            await this.followPort(runId, currentWorkflow, graph, node.id, "error", context, stepCount, projectId, phoneNumberId, customerPhone);
          } else {
            await this.failRun(runId, node.id, `Target flow "${targetFlowId}" not found.`);
          }
          break;
        }

        const targetFlow = targetRows[0];
        if (targetFlow.project_id !== projectId) {
          logger.error(`[FlowRunner] Target flow ${targetFlowId} belongs to another project.`);
          if (mode === "subflow") {
            await this.followPort(runId, currentWorkflow, graph, node.id, "error", context, stepCount, projectId, phoneNumberId, customerPhone);
          } else {
            await this.failRun(runId, node.id, "Target flow belongs to another project.");
          }
          break;
        }

        let targetGraph: WorkflowGraph;
        try {
          targetGraph = JSON.parse(targetFlow.graph_json);
        } catch {
          logger.error(`[FlowRunner] Failed to parse target graph for flow ${targetFlowId}`);
          if (mode === "subflow") {
            await this.followPort(runId, currentWorkflow, graph, node.id, "error", context, stepCount, projectId, phoneNumberId, customerPhone);
          } else {
            await this.failRun(runId, node.id, "Invalid target flow graph JSON.");
          }
          break;
        }

        // Determine entry node in target graph
        let targetEntryNode: WorkflowNode | undefined;
        if (entryNodeId) {
          targetEntryNode = targetGraph.nodes.find((n) => n.id === entryNodeId);
        }
        if (!targetEntryNode) {
          const triggerNode = targetGraph.nodes.find((n) => n.type === "trigger");
          if (triggerNode) {
            const firstEdge = targetGraph.edges.find((e) => e.from === triggerNode.id && e.port === "next");
            if (firstEdge) {
              targetEntryNode = targetGraph.nodes.find((n) => n.id === firstEdge.to);
            }
            if (!targetEntryNode) {
              targetEntryNode = triggerNode;
            }
          }
        }

        if (!targetEntryNode) {
          logger.error(`[FlowRunner] No valid entry node found in target flow ${targetFlowId}`);
          if (mode === "subflow") {
            await this.followPort(runId, currentWorkflow, graph, node.id, "error", context, stepCount, projectId, phoneNumberId, customerPhone);
          } else {
            await this.failRun(runId, node.id, `No valid entry node in target flow ${targetFlow.name}.`);
          }
          break;
        }

        const targetWorkflowInfo = {
          id: targetFlow.id,
          name: targetFlow.name,
          version: targetFlow.version,
        };

        if (mode === "handoff") {
          await this.recordAudit(runId, node.id, "flow_handoff", {
            sourceFlowId: currentWorkflow.id,
            sourceFlowName: currentWorkflow.name,
            targetFlowId: targetFlow.id,
            targetFlowName: targetFlow.name,
            mode: "handoff",
            entryNodeId: targetEntryNode.id,
          });

          await executeQuery(
            `UPDATE workflow_runs
             SET workflow_id = @wfId,
                 workflow_version = @version,
                 current_node_id = @nodeId,
                 context_json = @contextJson,
                 updated_at = SYSUTCDATETIME()
             WHERE id = @id`,
            {
              id: { type: sql.NVarChar(64), value: runId },
              wfId: { type: sql.NVarChar(64), value: targetFlow.id },
              version: { type: sql.Int, value: targetFlow.version },
              nodeId: { type: sql.NVarChar(64), value: targetEntryNode.id },
              contextJson: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(context) },
            }
          );

          await this.executeStep(
            runId,
            targetWorkflowInfo,
            targetGraph,
            targetEntryNode,
            context,
            stepCount + 1,
            projectId,
            phoneNumberId,
            customerPhone
          );
          break;
        } else {
          // Sub-flow mode: push caller frame onto call stack
          const frame: FlowCallFrame = {
            flowId: currentWorkflow.id,
            flowName: currentWorkflow.name,
            version: currentWorkflow.version,
            returnNodeId: node.id,
            returnPort: "completed",
          };
          const updatedCallStack = [...callStack, frame];
          context._call_stack = updatedCallStack;

          await this.recordAudit(runId, node.id, "subflow_called", {
            sourceFlowId: currentWorkflow.id,
            sourceFlowName: currentWorkflow.name,
            targetFlowId: targetFlow.id,
            targetFlowName: targetFlow.name,
            mode: "subflow",
            depth: updatedCallStack.length,
            entryNodeId: targetEntryNode.id,
          });

          await executeQuery(
            `UPDATE workflow_runs
             SET workflow_id = @wfId,
                 workflow_version = @version,
                 current_node_id = @nodeId,
                 context_json = @contextJson,
                 updated_at = SYSUTCDATETIME()
             WHERE id = @id`,
            {
              id: { type: sql.NVarChar(64), value: runId },
              wfId: { type: sql.NVarChar(64), value: targetFlow.id },
              version: { type: sql.Int, value: targetFlow.version },
              nodeId: { type: sql.NVarChar(64), value: targetEntryNode.id },
              contextJson: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(context) },
            }
          );

          await this.executeStep(
            runId,
            targetWorkflowInfo,
            targetGraph,
            targetEntryNode,
            context,
            stepCount + 1,
            projectId,
            phoneNumberId,
            customerPhone
          );
          break;
        }
      }

      case "calculation": {
        const operation = (node.data?.operation || "add") as string;
        const operandAStr = interpolateString(String(node.data?.operand_a ?? ""), context).trim();
        const operandBStr = interpolateString(String(node.data?.operand_b ?? ""), context).trim();
        const formulaStr = node.data?.formula ? interpolateString(node.data.formula, context).trim() : "";
        const saveTo = (node.data?.save_to || "calc_result").trim();
        const roundDecimals = typeof node.data?.round_decimals === "number" ? node.data.round_decimals : undefined;

        let computedResult: any = 0;

        const parseDateInput = (val: string): Date | null => {
          if (!val) return null;
          if (val === "{{$today}}" || val.toLowerCase() === "today") return new Date();
          if (val === "{{$tomorrow}}" || val.toLowerCase() === "tomorrow") return new Date(Date.now() + 86400000);
          const dmyMatch = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
          if (dmyMatch) {
            const d = parseInt(dmyMatch[1], 10);
            const m = parseInt(dmyMatch[2], 10) - 1;
            const y = parseInt(dmyMatch[3], 10);
            return new Date(y, m, d);
          }
          const parsed = new Date(val);
          return isNaN(parsed.getTime()) ? null : parsed;
        };

        const padZero = (n: number) => String(n).padStart(2, "0");
        const formatDateIso = (d: Date) => `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;

        switch (operation) {
          case "date_diff_days": {
            const dA = parseDateInput(operandAStr);
            const dB = parseDateInput(operandBStr);
            if (dA && dB) {
              const diffMs = dB.getTime() - dA.getTime();
              computedResult = Math.round(diffMs / (1000 * 60 * 60 * 24));
            } else {
              computedResult = 0;
            }
            break;
          }
          case "date_diff_hours": {
            const dA = parseDateInput(operandAStr);
            const dB = parseDateInput(operandBStr);
            if (dA && dB) {
              const diffMs = dB.getTime() - dA.getTime();
              computedResult = Math.round(diffMs / (1000 * 60 * 60));
            } else {
              computedResult = 0;
            }
            break;
          }
          case "date_diff_minutes": {
            const dA = parseDateInput(operandAStr);
            const dB = parseDateInput(operandBStr);
            if (dA && dB) {
              const diffMs = dB.getTime() - dA.getTime();
              computedResult = Math.round(diffMs / (1000 * 60));
            } else {
              computedResult = 0;
            }
            break;
          }
          case "date_add_days": {
            const dA = parseDateInput(operandAStr);
            const daysToAdd = parseFloat(operandBStr) || 0;
            if (dA) {
              const targetDate = new Date(dA.getTime() + daysToAdd * 86400000);
              computedResult = formatDateIso(targetDate);
            } else {
              computedResult = operandAStr;
            }
            break;
          }
          case "add": {
            const a = parseFloat(operandAStr) || 0;
            const b = parseFloat(operandBStr) || 0;
            computedResult = a + b;
            break;
          }
          case "subtract": {
            const a = parseFloat(operandAStr) || 0;
            const b = parseFloat(operandBStr) || 0;
            computedResult = a - b;
            break;
          }
          case "multiply": {
            const a = parseFloat(operandAStr) || 0;
            const b = parseFloat(operandBStr) || 0;
            computedResult = a * b;
            break;
          }
          case "divide": {
            const a = parseFloat(operandAStr) || 0;
            const b = parseFloat(operandBStr) || 1;
            computedResult = b !== 0 ? a / b : 0;
            break;
          }
          case "percentage": {
            const a = parseFloat(operandAStr) || 0;
            const percent = parseFloat(operandBStr) || 0;
            computedResult = (a * percent) / 100;
            break;
          }
          case "round": {
            const a = parseFloat(operandAStr) || 0;
            computedResult = Math.round(a);
            break;
          }
          case "floor": {
            const a = parseFloat(operandAStr) || 0;
            computedResult = Math.floor(a);
            break;
          }
          case "ceil": {
            const a = parseFloat(operandAStr) || 0;
            computedResult = Math.ceil(a);
            break;
          }
          case "formula": {
            try {
              const sanitizedExpr = formulaStr.replace(/[^0-9+\-*/().\s]/g, "");
              if (sanitizedExpr.trim()) {
                const fn = new Function(`"use strict"; return (${sanitizedExpr});`);
                const res = fn();
                computedResult = typeof res === "number" && !isNaN(res) ? res : 0;
              }
            } catch {
              computedResult = 0;
            }
            break;
          }
          default: {
            computedResult = parseFloat(operandAStr) || 0;
          }
        }

        if (typeof computedResult === "number" && roundDecimals !== undefined) {
          computedResult = Number(computedResult.toFixed(roundDecimals));
        }

        context[saveTo] = computedResult;

        await this.recordAudit(runId, node.id, "calculation_executed", {
          operation,
          operand_a: operandAStr,
          operand_b: operandBStr,
          save_to: saveTo,
          result: computedResult,
        });

        await this.followPort(runId, currentWorkflow, graph, node.id, "next", context, stepCount, projectId, phoneNumberId, customerPhone);
        break;
      }

      case "end": {
        if (node.data?.text) {
          const text = interpolateString(node.data.text, context);
          try {
            await messagingService.sendMessage({
              projectId,
              phoneNumberId: phoneNumberId || undefined,
              recipientPhone: customerPhone,
              messageType: "text",
              contentText: text,
            });
          } catch (err: any) {
            logger.warn(`[FlowRunner] End node message error: ${err.message}`);
          }
        }

        // Check if returning from a sub-flow
        const callStack: FlowCallFrame[] = Array.isArray(context._call_stack) ? context._call_stack : [];
        if (callStack.length > 0) {
          const frame = callStack.pop()!;
          context._call_stack = callStack;

          const callerRows = await executeQuery<any>(
            `SELECT id, name, version, graph_json FROM workflows WHERE id = @id`,
            { id: { type: sql.NVarChar(64), value: frame.flowId } }
          );

          if (callerRows && callerRows.length > 0) {
            const callerFlow = callerRows[0];
            const callerGraph: WorkflowGraph = JSON.parse(callerFlow.graph_json);

            await this.recordAudit(runId, node.id, "subflow_returned", {
              sourceFlowId: currentWorkflow.id,
              sourceFlowName: currentWorkflow.name,
              targetFlowId: callerFlow.id,
              targetFlowName: callerFlow.name,
              returnNodeId: frame.returnNodeId,
              returnPort: frame.returnPort || "completed",
              depth: callStack.length,
            });

            await executeQuery(
              `UPDATE workflow_runs
               SET workflow_id = @wfId,
                   workflow_version = @version,
                   current_node_id = @nodeId,
                   context_json = @contextJson,
                   updated_at = SYSUTCDATETIME()
               WHERE id = @id`,
              {
                id: { type: sql.NVarChar(64), value: runId },
                wfId: { type: sql.NVarChar(64), value: callerFlow.id },
                version: { type: sql.Int, value: callerFlow.version },
                nodeId: { type: sql.NVarChar(64), value: frame.returnNodeId },
                contextJson: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(context) },
              }
            );

            const callerWorkflowInfo = {
              id: callerFlow.id,
              name: callerFlow.name,
              version: callerFlow.version,
            };

            await this.followPort(
              runId,
              callerWorkflowInfo,
              callerGraph,
              frame.returnNodeId,
              frame.returnPort || "completed",
              context,
              stepCount + 1,
              projectId,
              phoneNumberId,
              customerPhone
            );
            return;
          }
        }

        await this.completeRun(runId, context, "Workflow ended cleanly at End node.");
        break;
      }

      default: {
        const nextEdge = graph.edges.find((e) => e.from === node.id && e.port === "next");
        if (nextEdge) {
          const nextNode = graph.nodes.find((n) => n.id === nextEdge.to);
          if (nextNode) {
            await this.executeStep(runId, currentWorkflow, graph, nextNode, context, stepCount + 1, projectId, phoneNumberId, customerPhone);
            return;
          }
        }
        await this.completeRun(runId, context, "Workflow reached terminus.");
      }
    }
  }

  private static async followPort(
    runId: string,
    currentWorkflow: { id: string; name: string; version: number },
    graph: WorkflowGraph,
    fromNodeId: string,
    port: string,
    context: Record<string, any>,
    stepCount: number,
    projectId: string,
    phoneNumberId: string | null,
    customerPhone: string
  ): Promise<void> {
    const edge = graph.edges.find((e) => e.from === fromNodeId && e.port === port);
    if (!edge) {
      await this.completeRun(runId, context, `No edge on port "${port}". Run ended.`);
      return;
    }
    const nextNode = graph.nodes.find((n) => n.id === edge.to);
    if (!nextNode) {
      await this.failRun(runId, fromNodeId, `Target node "${edge.to}" not found.`);
      return;
    }
    await this.executeStep(runId, currentWorkflow, graph, nextNode, context, stepCount + 1, projectId, phoneNumberId, customerPhone);
  }

  private static async setWaitingReply(
    runId: string,
    nodeId: string,
    context: Record<string, any>,
    stepCount: number
  ): Promise<void> {
    await executeQuery(
      `UPDATE workflow_runs
       SET status = 'waiting_reply',
           current_node_id = @nodeId,
           step_count = @stepCount,
           context_json = @contextJson,
           updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      {
        id: { type: sql.NVarChar(64), value: runId },
        nodeId: { type: sql.NVarChar(64), value: nodeId },
        stepCount: { type: sql.Int, value: stepCount },
        contextJson: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(context) },
      }
    );
  }

  private static async completeRun(runId: string, context: Record<string, any>, reason: string): Promise<void> {
    await executeQuery(
      `UPDATE workflow_runs
       SET status = 'completed',
           context_json = @contextJson,
           updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      {
        id: { type: sql.NVarChar(64), value: runId },
        contextJson: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(context) },
      }
    );
    await this.recordAudit(runId, null, "completed", { reason });
  }

  private static async failRun(runId: string, nodeId: string | null, errorMessage: string): Promise<void> {
    await executeQuery(
      `UPDATE workflow_runs
       SET status = 'failed',
           updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      { id: { type: sql.NVarChar(64), value: runId } }
    );
    await this.recordAudit(runId, nodeId, "failed", { error: errorMessage });
  }

  private static async updateRunStatus(runId: string, status: WorkflowRunStatus): Promise<void> {
    await executeQuery(
      `UPDATE workflow_runs
       SET status = @status,
           updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      {
        id: { type: sql.NVarChar(64), value: runId },
        status: { type: sql.NVarChar(30), value: status },
      }
    );
  }

  private static async isHostAllowed(hostname: string, projectId: string): Promise<boolean> {
    return checkHostAllowed(hostname, projectId);
  }

  private static async recordAudit(
    runId: string,
    nodeId: string | null,
    event: string,
    detail: Record<string, any>
  ): Promise<void> {
    const id = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    try {
      await executeQuery(
        `INSERT INTO workflow_audit_log (id, run_id, node_id, event, detail, created_at)
         VALUES (@id, @runId, @nodeId, @event, @detail, SYSUTCDATETIME())`,
        {
          id: { type: sql.NVarChar(64), value: id },
          runId: { type: sql.NVarChar(64), value: runId },
          nodeId: { type: sql.NVarChar(64), value: nodeId },
          event: { type: sql.NVarChar(50), value: event },
          detail: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(detail) },
        }
      );
    } catch (auditErr: any) {
      logger.warn(`[FlowRunner] Audit record failure: ${auditErr.message}`);
    }
  }
}
