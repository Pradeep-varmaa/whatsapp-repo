"use client";

import React, { useState, useEffect } from "react";
import {
  WorkflowNode,
  WorkflowGraph,
  ASK_KINDS,
  ASK_KIND_LABELS,
  normalizeAskKind,
  AskKind,
  CONDITION_OPERATORS,
  CONDITION_OPERATOR_LABELS,
  ConditionOperator,
} from "@/server/workflows/types";
import { parseAndNormalizeDate } from "@/server/workflows/dateUtils";
import { interpolateString, resolveVariable, resolveValue, analyzeApiResponse, DetectedArrayInfo } from "@/server/workflows/variableInterpolator";
import {
  Trash2,
  Plus,
  Play,
  RotateCcw,
  Send,
  Settings,
  Smartphone,
  Zap,
  Copy,
  Check,
  ExternalLink,
  Code,
  Key,
  Layers,
  Sparkles,
  ShieldCheck,
  Calendar,
  Clock,
  Bot,
  GitBranch,
  AlertTriangle,
  List,
} from "lucide-react";
import { message, Modal } from "antd";
import { AddAllowlistModal } from "./AddAllowlistModal";
import { CalendarPicker } from "./CalendarPicker";
import { TimePicker } from "./TimePicker";
import { computeExecutionOrder, NODE_TYPE_COLORS, getNodeTypeName } from "./workflowUtils";

export const SHOW_LIVE_PREVIEW = false;

const fieldLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#101828",
  display: "block",
  marginBottom: "4px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "6px",
  background: "#ffffff",
  border: "1px solid #d0d5dd",
  color: "#101828",
  fontSize: "12px",
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "6px",
  background: "#ffffff",
  border: "1px solid #d0d5dd",
  color: "#101828",
  fontSize: "12px",
  outline: "none",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "6px",
  background: "#ffffff",
  border: "1px solid #d0d5dd",
  color: "#101828",
  fontSize: "12px",
  outline: "none",
  resize: "vertical",
  boxSizing: "border-box",
};

interface InspectorPanelProps {
  selectedNode: WorkflowNode | null;
  graph: WorkflowGraph;
  projectId?: string;
  currentWorkflowId?: string;
  onUpdateNodeData: (nodeId: string, newData: Record<string, any>) => void;
  onDeleteNode: (nodeId: string) => void;
  onCopyNode?: () => void;
  onSelectNode?: (nodeId: string) => void;
}

export function InspectorPanel({
  selectedNode,
  graph,
  projectId,
  currentWorkflowId,
  onUpdateNodeData,
  onDeleteNode,
  onCopyNode,
  onSelectNode,
}: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<"edit" | "test">("edit");
  const [viewTab, setViewTab] = useState<"steps" | "selected">(selectedNode ? "selected" : "steps");
  const [showDeleteStepModal, setShowDeleteStepModal] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

  useEffect(() => {
    if (selectedNode) {
      setViewTab("selected");
    }
  }, [selectedNode?.id]);

  // Target workflows for Go to Flow node
  const [availableFlows, setAvailableFlows] = useState<any[]>([]);
  const [isLoadingFlows, setIsLoadingFlows] = useState(false);
  const [targetFlowNodes, setTargetFlowNodes] = useState<{ id: string; type: string; data?: any }[]>([]);

  useEffect(() => {
    if (selectedNode?.type === "goto_flow" && projectId) {
      setIsLoadingFlows(true);
      fetch(`/api/workflows?projectId=${encodeURIComponent(projectId)}&status=active`)
        .then((res) => (res.ok ? res.json() : []))
        .then((resData) => {
          const list = Array.isArray(resData?.data) ? resData.data : (Array.isArray(resData) ? resData : []);
          const filtered = list.filter((wf: any) => wf.id !== currentWorkflowId);
          setAvailableFlows(filtered);
        })
        .catch(() => {
          setAvailableFlows([]);
        })
        .finally(() => {
          setIsLoadingFlows(false);
        });
    }
  }, [selectedNode?.type, projectId, currentWorkflowId]);

  useEffect(() => {
    const targetId = selectedNode?.data?.target_flow_id;
    if (selectedNode?.type === "goto_flow" && targetId) {
      fetch(`/api/workflows/${encodeURIComponent(targetId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((res) => {
          if (res?.data?.graph?.nodes) {
            setTargetFlowNodes(res.data.graph.nodes);
          } else if (res?.graph_json) {
            try {
              const parsed = JSON.parse(res.graph_json);
              setTargetFlowNodes(parsed.nodes || []);
            } catch {
              setTargetFlowNodes([]);
            }
          }
        })
        .catch(() => {
          setTargetFlowNodes([]);
        });
    } else {
      setTargetFlowNodes([]);
    }
  }, [selectedNode?.type, selectedNode?.data?.target_flow_id]);

  useEffect(() => {
    const checkWidth = () => {
      setIsMobileOrTablet(window.innerWidth < 1024);
    };
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  // Compute execution order and validation states for all steps
  const orderedSteps = computeExecutionOrder(
    (graph.nodes || []).map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position || { x: 0, y: 0 },
      data: n.data || {},
    })),
    (graph.edges || []).map((e, idx) => ({
      id: e.id || `e_${e.from}_${e.to}_${idx}`,
      source: e.from,
      sourceHandle: e.port,
      target: e.to,
    }))
  );

  const filteredSteps = orderedSteps.filter((s) => {
    if (!filterText.trim()) return true;
    const q = filterText.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      s.subtitle.toLowerCase().includes(q) ||
      s.node.id.toLowerCase().includes(q) ||
      String(s.stepNumber).includes(q)
    );
  });

  const selectedStepInfo = orderedSteps.find((s) => s.node.id === selectedNode?.id);

  // Live API test state
  const [testingApi, setTestingApi] = useState(false);
  const [testApiResult, setTestApiResult] = useState<{
    status?: number;
    statusText?: string;
    durationMs?: number;
    ok?: boolean;
    isJson?: boolean;
    fields?: Array<{ path: string; sample: string; type: string }>;
    rawText?: string;
    error?: string;
    isAllowlistError?: boolean;
    hostname?: string;
    json?: any;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [allowlistModalOpen, setAllowlistModalOpen] = useState<boolean>(false);
  const [allowlistInitialHost, setAllowlistInitialHost] = useState<string>("");
  const [addingHostQuickly, setAddingHostQuickly] = useState<boolean>(false);

  const discoveredWorkflowVars = React.useMemo(() => {
    const vars = new Set<string>(["customer_name", "customer_phone"]);
    if (graph?.nodes) {
      for (const n of graph.nodes) {
        if (n.type === "ask" && (n.data as any)?.var) {
          vars.add((n.data as any).var);
        }
        if (n.type === "api") {
          const s = (n.data as any)?.save;
          if (s) vars.add(s);
          const mappings = (n.data as any)?.mappings;
          if (Array.isArray(mappings)) {
            for (const m of mappings) {
              if (m.to) vars.add(m.to);
            }
          }
        }
        if (n.type === "buttons" || n.type === "list") {
          if ((n.data as any)?.save_row_id_to) vars.add((n.data as any).save_row_id_to);
          if ((n.data as any)?.save_row_title_to) vars.add((n.data as any).save_row_title_to);
        }
      }
    }
    vars.add("selected_date");
    vars.add("selected_time");
    return Array.from(vars);
  }, [graph?.nodes]);

  const handleTestApi = async (overrideUrl?: string, overrideNodeId?: string): Promise<any> => {
    const targetNode = overrideNodeId ? graph.nodes.find((n) => n.id === overrideNodeId) : selectedNode;
    const targetUrl = overrideUrl || targetNode?.data?.url;
    if (!targetUrl || !targetNode) return null;
    setTestingApi(true);
    setTestApiResult(null);

    try {
      const res = await fetch("/api/workflows/test-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          method: targetNode.data.method || "GET",
          authorization: targetNode.data.authorization,
          contentType: targetNode.data.contentType || "application/json",
          body: targetNode.data.body,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const resultData = {
          status: json.data.status,
          statusText: json.data.statusText,
          durationMs: json.data.durationMs,
          ok: json.data.ok,
          isJson: json.data.isJson,
          fields: json.data.fields || [],
          rawText: json.data.rawText,
          json: json.data.json,
        };
        setTestApiResult(resultData);
        onUpdateNodeData(targetNode.id, {
          last_response: json.data.json,
          last_fields: json.data.fields || [],
        });
        message.success(`Received response: ${json.data.status} ${json.data.statusText} (${json.data.durationMs}ms)`);
        return json.data.json;
      } else {
        setTestApiResult({
          error: json.error?.message || "Failed to fetch response",
          isAllowlistError: json.isAllowlistError,
          hostname: json.hostname,
        });
        return null;
      }
    } catch (err: any) {
      setTestApiResult({ error: err.message || "Network request failed" });
      return null;
    } finally {
      setTestingApi(false);
    }
  };

  const handleQuickAddAllowlist = async (hostToAdd: string) => {
    if (!hostToAdd) return;
    setAddingHostQuickly(true);
    try {
      const res = await fetch("/api/webhook-allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: hostToAdd }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        message.success(`Host "${hostToAdd}" added to Webhook Allowlist! Retesting API...`);
        await handleTestApi();
      } else {
        message.error(data.error?.message || "Failed to allowlist host");
      }
    } catch (err: any) {
      message.error(err.message || "Failed to allowlist host");
    } finally {
      setAddingHostQuickly(false);
    }
  };

  // Simulator state
  const [chatMessages, setChatMessages] = useState<
    Array<{
      sender: "bot" | "user";
      text: string;
      buttons?: any[];
      list?: any[];
      kind?: string;
      isCalendar?: boolean;
      isTime?: boolean;
    }>
  >([]);
  const [simContext, setSimContext] = useState<Record<string, any>>({
    customer_phone: "+15550198234",
  });
  const [simCurrentNodeId, setSimCurrentNodeId] = useState<string | null>(null);
  const [simUserInput, setSimUserInput] = useState("");
  const [simWaitingKind, setSimWaitingKind] = useState<string | null>(null);
  const [simWaitingVar, setSimWaitingVar] = useState<string | null>(null);
  const [simPickerMode, setSimPickerMode] = useState<"calendar" | "time" | null>(null);

  // Restart simulator whenever switched to "test" tab or manually restarted
  const startSimulator = () => {
    const trigger = graph.nodes.find((n) => n.type === "trigger");
    const initialCtx = { customer_phone: "+15550198234" };
    setSimContext(initialCtx);
    setChatMessages([]);
    setSimWaitingKind(null);
    setSimWaitingVar(null);

    if (!trigger) {
      setChatMessages([{ sender: "bot", text: "⚠️ No Trigger node found in this workflow." }]);
      return;
    }

    // Follow trigger's next port
    const firstEdge = graph.edges.find((e) => e.from === trigger.id && e.port === "next");
    if (!firstEdge) {
      setChatMessages([{ sender: "bot", text: "⚡ Trigger reached. (No next step connected)" }]);
      return;
    }

    stepSimulator(firstEdge.to, initialCtx);
  };

  const stepSimulator = async (nodeId: string, context: Record<string, any>) => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    setSimCurrentNodeId(node.id);

    if (node.type === "message") {
      const text = interpolateString(node.data?.text || "", context);
      setChatMessages((prev) => [...prev, { sender: "bot", text }]);
      const nextEdge = graph.edges.find((e) => e.from === node.id && e.port === "next");
      if (nextEdge) {
        setTimeout(() => { void stepSimulator(nextEdge.to, context); }, 400);
      }
    } else if (node.type === "buttons") {
      const text = interpolateString(node.data?.text || "", context);
      const opts = (node.data?.opts || []).map((o: any) => ({
        id: o.id,
        title: interpolateString(o.title || "", context),
      }));
      setChatMessages((prev) => [...prev, { sender: "bot", text, buttons: opts }]);
      setSimWaitingKind("button");
    } else if (node.type === "list") {
      const text = interpolateString(node.data?.text || "", context);
      const isDynamic = Boolean(node.data?.is_dynamic || node.data?.dynamicRows);

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
          setChatMessages((prev) => [...prev, { sender: "bot", text: fallbackText }]);
          const emptyEdge = graph.edges.find((e) => e.from === node.id && (e.port === "empty" || e.port === "next" || e.port === "default"));
          if (emptyEdge) {
            setTimeout(() => { void stepSimulator(emptyEdge.to, context); }, 300);
          }
          return;
        }

        const seenIds = new Set<string>();
        const mappedOpts = items.slice(0, 10).map((item: any, idx: number) => {
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
              if (item[trimmed] !== undefined && item[trimmed] !== null) {
                return typeof item[trimmed] === "object" ? JSON.stringify(item[trimmed]) : String(item[trimmed]);
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

        setChatMessages((prev) => [...prev, { sender: "bot", text, list: mappedOpts }]);
        setSimWaitingKind("list");
      } else {
        const seenIds = new Set<string>();
        const mappedOpts = (node.data?.opts || []).slice(0, 10).map((o: any, idx: number) => {
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
        setChatMessages((prev) => [...prev, { sender: "bot", text, list: mappedOpts }]);
        setSimWaitingKind("list");
      }
    } else if (node.type === "ask") {
      const text = interpolateString(node.data?.text || "", context);
      const kind = node.data?.kind || "text";

      let interactiveList: any[] | undefined;
      if (kind === "date") {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const weekdayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
        interactiveList = [
          { id: "opt_today", title: `Today (${weekdayFmt.format(now)})`, description: "" },
          { id: "opt_tomorrow", title: `Tomorrow (${weekdayFmt.format(new Date(now.getTime() + 24 * 3600 * 1000))})`, description: "" },
        ];
        for (let i = 2; i <= 6; i++) {
          const nextDay = new Date(now.getTime() + i * 24 * 3600 * 1000);
          const iso = `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}`;
          interactiveList.push({
            id: `opt_date_${iso}`,
            title: weekdayFmt.format(nextDay),
            description: `Date: ${iso}`,
          });
        }
        interactiveList.push({ id: "opt_custom_date", title: "📅 Custom Date", description: "Pick custom date below" });
      } else if (kind === "time") {
        interactiveList = [
          { id: "slot_10am", title: "10:00 AM - 11:00 AM", description: "Morning slot" },
          { id: "slot_11am", title: "11:00 AM - 12:00 PM", description: "Morning slot" },
          { id: "slot_02pm", title: "02:00 PM - 03:00 PM", description: "Afternoon slot" },
          { id: "slot_03pm", title: "03:00 PM - 04:00 PM", description: "Afternoon slot" },
          { id: "slot_05pm", title: "05:00 PM - 06:00 PM", description: "Evening slot" },
          { id: "slot_06pm", title: "06:00 PM - 07:00 PM", description: "Evening slot" },
          { id: "slot_custom", title: "⏰ Custom Time", description: "Pick custom time below" },
        ];
      }

      setChatMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text,
          list: interactiveList,
          isCalendar: kind === "date",
          isTime: kind === "time",
        },
      ]);
      setSimWaitingKind(kind);
      setSimWaitingVar(node.data?.var || "response");
    } else if (node.type === "api") {
      // Execute the real API call through webhook allowlist without printing [API Call]: GET ...
      const nextContext = { ...context };
      let apiSucceeded = false;

      if (node.data?.url) {
        try {
          const res = await fetch("/api/workflows/test-api", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: node.data.url,
              method: node.data.method || "GET",
              authorization: node.data.authorization,
              contentType: node.data.contentType || "application/json",
              headers: node.data.headers,
              body: node.data.body,
              sampleVariables: context,
            }),
          });
          const json = await res.json();
          if (res.ok && json.success && json.data) {
            apiSucceeded = true;
            const resData = json.data.json !== null && json.data.json !== undefined ? json.data.json : json.data.rawText;
            const saveVar = node.data?.save || "api_result";
            nextContext[saveVar] = resData;

            if (typeof resData === "object" && !Array.isArray(resData) && resData !== null) {
              for (const [k, v] of Object.entries(resData)) {
                if (!(k in nextContext)) {
                  nextContext[k] = v;
                }
              }
            }
            setSimContext(nextContext);
          } else {
            const errMsg = json.error?.message || "API request failed";
            setChatMessages((prev) => [
              ...prev,
              { sender: "bot", text: `⚠️ API Error: ${errMsg}` },
            ]);
          }
        } catch (fetchErr: any) {
          setChatMessages((prev) => [
            ...prev,
            { sender: "bot", text: `⚠️ API Network Error: ${fetchErr.message || "Failed to connect"}` },
          ]);
        }
      }

      if (apiSucceeded) {
        const successEdge = graph.edges.find((e) => e.from === node.id && (e.port === "success" || e.port === "next"));
        if (successEdge) {
          setTimeout(() => { void stepSimulator(successEdge.to, nextContext); }, 300);
        }
      } else {
        const errorEdge = graph.edges.find((e) => e.from === node.id && e.port === "error");
        if (errorEdge) {
          setTimeout(() => { void stepSimulator(errorEdge.to, nextContext); }, 300);
        }
      }
    } else if (node.type === "condition") {
      const variable = node.data?.variable || "";
      const operator = (node.data?.operator || "equals") as ConditionOperator;
      const targetVal = interpolateString(String(node.data?.value ?? ""), context);
      const actualVal = resolveValue(variable, context);
      const strActual = actualVal !== null && actualVal !== undefined ? String(actualVal).trim() : "";
      const strTarget = String(targetVal ?? "").trim();

      let isMatch = false;
      switch (operator) {
        case "equals":
          isMatch = strActual.toLowerCase() === strTarget.toLowerCase();
          break;
        case "not_equals":
          isMatch = strActual.toLowerCase() !== strTarget.toLowerCase();
          break;
        case "contains":
          isMatch = strActual.toLowerCase().includes(strTarget.toLowerCase());
          break;
        case "not_contains":
          isMatch = !strActual.toLowerCase().includes(strTarget.toLowerCase());
          break;
        case "greater_than": {
          const numA = parseFloat(strActual);
          const numB = parseFloat(strTarget);
          isMatch = !isNaN(numA) && !isNaN(numB) ? numA > numB : strActual > strTarget;
          break;
        }
        case "less_than": {
          const numA = parseFloat(strActual);
          const numB = parseFloat(strTarget);
          isMatch = !isNaN(numA) && !isNaN(numB) ? numA < numB : strActual < strTarget;
          break;
        }
        case "is_empty":
          isMatch = actualVal === null || actualVal === undefined || strActual === "";
          break;
        case "is_not_empty":
          isMatch = actualVal !== null && actualVal !== undefined && strActual !== "";
          break;
        case "exists":
          isMatch = actualVal !== undefined && actualVal !== null;
          break;
        default:
          isMatch = false;
      }

      setChatMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: `🔀 Condition [${variable} ${operator} "${strTarget}"] evaluated: ${
            isMatch ? "✓ True (If Branch)" : "✕ False (Else Branch)"
          }`,
        },
      ]);

      const targetPort = isMatch ? "true" : "false";
      const branchEdge = graph.edges.find((e) => e.from === node.id && e.port === targetPort);
      if (branchEdge) {
        setTimeout(() => { void stepSimulator(branchEdge.to, context); }, 300);
      }
    } else if (node.type === "calculation") {
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
          return new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
        }
        const parsed = new Date(val);
        return isNaN(parsed.getTime()) ? null : parsed;
      };

      if (operation === "date_diff_days") {
        const dA = parseDateInput(operandAStr);
        const dB = parseDateInput(operandBStr);
        computedResult = dA && dB ? Math.round((dB.getTime() - dA.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      } else if (operation === "date_diff_hours") {
        const dA = parseDateInput(operandAStr);
        const dB = parseDateInput(operandBStr);
        computedResult = dA && dB ? Math.round((dB.getTime() - dA.getTime()) / (1000 * 60 * 60)) : 0;
      } else if (operation === "date_diff_minutes") {
        const dA = parseDateInput(operandAStr);
        const dB = parseDateInput(operandBStr);
        computedResult = dA && dB ? Math.round((dB.getTime() - dA.getTime()) / (1000 * 60)) : 0;
      } else if (operation === "date_add_days") {
        const dA = parseDateInput(operandAStr);
        const days = parseFloat(operandBStr) || 0;
        if (dA) {
          const t = new Date(dA.getTime() + days * 86400000);
          computedResult = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
        } else {
          computedResult = operandAStr;
        }
      } else if (operation === "add") {
        computedResult = (parseFloat(operandAStr) || 0) + (parseFloat(operandBStr) || 0);
      } else if (operation === "subtract") {
        computedResult = (parseFloat(operandAStr) || 0) - (parseFloat(operandBStr) || 0);
      } else if (operation === "multiply") {
        computedResult = (parseFloat(operandAStr) || 0) * (parseFloat(operandBStr) || 0);
      } else if (operation === "divide") {
        const b = parseFloat(operandBStr) || 1;
        computedResult = b !== 0 ? (parseFloat(operandAStr) || 0) / b : 0;
      } else if (operation === "percentage") {
        computedResult = ((parseFloat(operandAStr) || 0) * (parseFloat(operandBStr) || 0)) / 100;
      } else if (operation === "round") {
        computedResult = Math.round(parseFloat(operandAStr) || 0);
      } else if (operation === "floor") {
        computedResult = Math.floor(parseFloat(operandAStr) || 0);
      } else if (operation === "ceil") {
        computedResult = Math.ceil(parseFloat(operandAStr) || 0);
      } else if (operation === "formula") {
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
      } else {
        computedResult = parseFloat(operandAStr) || 0;
      }

      if (typeof computedResult === "number" && roundDecimals !== undefined) {
        computedResult = Number(computedResult.toFixed(roundDecimals));
      }

      const nextContext = { ...context, [saveTo]: computedResult };
      setSimContext(nextContext);

      setChatMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: `🧮 Computed [${operation}]: ${saveTo} = ${computedResult}`,
        },
      ]);

      const nextEdge = graph.edges.find((e) => e.from === node.id && (e.port === "next" || e.port === "default"));
      if (nextEdge) {
        setTimeout(() => { void stepSimulator(nextEdge.to, nextContext); }, 300);
      }
    } else if (node.type === "end") {
      const text = interpolateString(node.data?.text || "Workflow finished.", context);
      setChatMessages((prev) => [...prev, { sender: "bot", text: `🏁 ${text}` }]);
      setSimWaitingKind(null);
    }
  };

  const handleSimUserReply = (replyText: string, portId?: string, msgIndex?: number) => {
    if (!replyText.trim()) return;

    // After selecting an option, remove buttons/list/calendar/time from the message(s) so they disappear
    setChatMessages((prev) => {
      const updated = prev.map((msg, idx) => {
        if (msgIndex !== undefined ? idx === msgIndex : (msg.buttons || msg.list || msg.isCalendar || msg.isTime)) {
          return {
            ...msg,
            buttons: undefined,
            list: undefined,
            isCalendar: false,
            isTime: false,
          };
        }
        return msg;
      });
      return [...updated, { sender: "user", text: replyText }];
    });
    setSimUserInput("");
    setSimPickerMode(null);

    const currentNode = graph.nodes.find((n) => n.id === simCurrentNodeId);
    if (!currentNode) return;

    const nextContext = { ...simContext };

    if (currentNode.type === "ask" && simWaitingVar) {
      const cleanVal = replyText.trim();
      if (simWaitingKind === "date" || simWaitingVar.toLowerCase().includes("date")) {
        const normalized = parseAndNormalizeDate(cleanVal);
        if (!normalized) {
          setChatMessages((prev) => [
            ...prev,
            { sender: "bot", text: "⚠️ Please enter a valid date (e.g. 25/11/2026 or YYYY-MM-DD)." },
          ]);
          return;
        }
        nextContext[simWaitingVar] = normalized;
        nextContext["selected_date"] = normalized;
        nextContext["selected_date_label"] = cleanVal;
      } else if (simWaitingKind === "time" || simWaitingVar.toLowerCase().includes("time")) {
        nextContext[simWaitingVar] = cleanVal;
        nextContext["selected_time"] = cleanVal;
      } else {
        nextContext[simWaitingVar] = cleanVal;
      }
      setSimContext(nextContext);
      setSimWaitingVar(null);
      setSimWaitingKind(null);

      const nextEdge = graph.edges.find((e) => e.from === currentNode.id && e.port === "next");
      if (nextEdge) {
        setTimeout(() => { void stepSimulator(nextEdge.to, nextContext); }, 300);
      }
    } else if (currentNode.type === "buttons" || currentNode.type === "list") {
      setSimWaitingKind(null);
      const selectedId = portId || replyText.trim();
      const selectedTitle = replyText.trim();

      const saveIdVar = currentNode.data?.save_row_id_to || "selected_row_id";
      const saveTitleVar = currentNode.data?.save_row_title_to || "selected_row_title";

      nextContext[saveIdVar] = selectedId;
      nextContext[saveTitleVar] = selectedTitle;
      nextContext["selected_row_id"] = selectedId;
      nextContext["selected_row_title"] = selectedTitle;

      // Extract date and time if selected option relates to date/time
      const lowerId = selectedId.toLowerCase();
      const lowerTitle = selectedTitle.toLowerCase();
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const todayISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowISO = `${tomorrowDate.getFullYear()}-${pad(tomorrowDate.getMonth() + 1)}-${pad(tomorrowDate.getDate())}`;

      if (lowerId.includes("today") || lowerTitle.includes("today")) {
        nextContext["selected_date"] = todayISO;
        nextContext["selected_date_label"] = interpolateString("{{$today}}", nextContext);
      } else if (lowerId.includes("tomorrow") || lowerTitle.includes("tomorrow")) {
        nextContext["selected_date"] = tomorrowISO;
        nextContext["selected_date_label"] = interpolateString("{{$tomorrow}}", nextContext);
      } else if (lowerId.includes("selected_date") || lowerTitle.includes("selected date") || lowerTitle.includes("pick date")) {
        nextContext["selected_date"] = "selected_date";
        nextContext["selected_date_label"] = "Selected Date";
      }

      const timeMatch = selectedTitle.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)(?:\s*-\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))?/i);
      if (timeMatch) {
        nextContext["selected_time"] = timeMatch[0];
      } else if (lowerId.includes("morning") || lowerTitle.includes("morning")) {
        nextContext["selected_time"] = "10:00 AM - 01:00 PM";
      } else if (lowerId.includes("afternoon") || lowerTitle.includes("afternoon")) {
        nextContext["selected_time"] = "02:00 PM - 05:00 PM";
      } else if (lowerId.includes("evening") || lowerTitle.includes("evening")) {
        nextContext["selected_time"] = "06:00 PM - 09:00 PM";
      }

      if (currentNode.data?.is_dynamic && currentNode.data?.array_path) {
        const rawArr = resolveValue(currentNode.data.array_path, nextContext);
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
            nextContext["selected_row"] = matchedItem;
          }
        }
      }

      setSimContext(nextContext);

      const port = selectedId;
      const edge =
        graph.edges.find((e) => e.from === currentNode.id && e.port === port) ||
        graph.edges.find((e) => e.from === currentNode.id && e.port.toLowerCase() === port.toLowerCase()) ||
        graph.edges.find((e) => e.from === currentNode.id && (e.port === "next" || e.port === "default" || e.port === "selected"));

      if (!edge && (selectedId === "opt_selected_date" || selectedTitle.toLowerCase().includes("selected date"))) {
        // If "Selected Date" is clicked and not wired to a next step, prompt with calendar directly
        setTimeout(() => {
          setChatMessages((prev) => [
            ...prev,
            {
              sender: "bot",
              text: "📅 Please choose your preferred date from the calendar:",
              isCalendar: true,
            },
          ]);
          setSimWaitingKind("date");
          setSimWaitingVar("selected_date");
        }, 300);
        return;
      }

      if (edge) {
        setTimeout(() => { void stepSimulator(edge.to, nextContext); }, 300);
      }
    }
  };

  const panelStyle: React.CSSProperties = isMobileOrTablet
    ? {
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: isBottomSheetOpen || Boolean(selectedNode) ? "65vh" : "48px",
        width: "100%",
        zIndex: 1000,
        boxShadow: "0 -4px 20px rgba(0,0,0,0.15)",
        borderRadius: "16px 16px 0 0",
        borderTop: "1px solid #eaecf0",
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "height 0.25s ease-in-out",
      }
    : {
        width: "360px",
        height: "100%",
        borderLeft: "1px solid var(--border, #eaecf0)",
        background: "var(--bg-card, #ffffff)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      };

  return (
    <div style={panelStyle}>
      {isMobileOrTablet && (
        <div
          onClick={() => setIsBottomSheetOpen((prev) => !prev)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 0 4px 0",
            cursor: "pointer",
          }}
        >
          <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "#d0d5dd" }} />
        </div>
      )}

      {SHOW_LIVE_PREVIEW && (
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border, #eaecf0)",
            background: "#ffffff",
          }}
        >
          <button
            onClick={() => setActiveTab("edit")}
            style={{
              flex: 1,
              padding: "12px",
              border: "none",
              background: activeTab === "edit" ? "#ffffff" : "transparent",
              color: activeTab === "edit" ? "#10b981" : "#475467",
              fontWeight: 600,
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              borderBottom: activeTab === "edit" ? "2px solid #10b981" : "2px solid transparent",
            }}
          >
            <Settings size={14} /> Agent Step
          </button>
          <button
            onClick={() => {
              setActiveTab("test");
              startSimulator();
            }}
            style={{
              flex: 1,
              padding: "12px",
              border: "none",
              background: activeTab === "test" ? "#ffffff" : "transparent",
              color: activeTab === "test" ? "#10b981" : "#475467",
              fontWeight: 600,
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              borderBottom: activeTab === "test" ? "2px solid #10b981" : "2px solid transparent",
            }}
          >
            <Bot size={14} /> Test Agent
          </button>
        </div>
      )}

      {/* Top Toggle Switcher: "All Steps" vs "Selected Step" */}
      {!SHOW_LIVE_PREVIEW && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "8px 12px",
            borderBottom: "1px solid #eaecf0",
            background: "#ffffff",
            gap: "8px",
          }}
        >
          <button
            type="button"
            onClick={() => setViewTab("steps")}
            style={{
              flex: 1,
              padding: "7px 10px",
              borderRadius: "6px",
              border: viewTab === "steps" ? "1px solid #10b981" : "1px solid #eaecf0",
              background: viewTab === "steps" ? "#ecfdf3" : "#f9fafb",
              color: viewTab === "steps" ? "#027a48" : "#475467",
              fontWeight: 600,
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            <List size={13} />
            <span>All Steps ({orderedSteps.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setViewTab("selected")}
            style={{
              flex: 1,
              padding: "7px 10px",
              borderRadius: "6px",
              border: viewTab === "selected" ? "1px solid #10b981" : "1px solid #eaecf0",
              background: viewTab === "selected" ? "#ecfdf3" : "#f9fafb",
              color: viewTab === "selected" ? "#027a48" : "#475467",
              fontWeight: 600,
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            <Settings size={13} />
            <span>Selected Step</span>
            {selectedNode && (
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  background: "#027a48",
                  color: "#ffffff",
                  fontWeight: 700,
                }}
              >
                #{selectedStepInfo?.stepNumber || selectedNode.type}
              </span>
            )}
          </button>
        </div>
      )}

      {/* SECTION A: All steps (N) */}
      {!SHOW_LIVE_PREVIEW && viewTab === "steps" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            height: "100%",
            background: "#ffffff",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 16px 8px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#101828" }}>
              All steps ({orderedSteps.length})
            </div>
            <div style={{ position: "relative", width: "130px" }}>
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter..."
                style={{
                  width: "100%",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid #d0d5dd",
                  fontSize: "12px",
                  color: "#101828",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Scrollable List */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "0 8px 8px 8px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            {filteredSteps.length === 0 ? (
              <div style={{ padding: "16px 8px", textAlign: "center", color: "#98a2b3", fontSize: "12px" }}>
                No steps match &quot;{filterText}&quot;
              </div>
            ) : (
              filteredSteps.map((s) => {
                const isSelected = selectedNode?.id === s.node.id;
                const dotColor = NODE_TYPE_COLORS[s.node.type || ""]?.dot || "#6b7280";

                return (
                  <div
                    key={s.node.id}
                    onClick={() => {
                      onSelectNode?.(s.node.id);
                      setViewTab("selected");
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "7px 10px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      background: isSelected ? "#ecfdf3" : "transparent",
                      borderLeft: isSelected ? "3px solid #10b981" : "3px solid transparent",
                      transition: "all 0.12s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = "#f9fafb";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <div
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: dotColor,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: "12.5px", fontWeight: isSelected ? 700 : 500, color: "#101828" }}>
                        {s.stepNumber} {s.title}
                      </span>
                      {s.subtitle && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#667085",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "130px",
                          }}
                          title={s.subtitle}
                        >
                          · {s.subtitle}
                        </span>
                      )}
                    </div>

                    {s.hasError && (
                      <span
                        style={{
                          padding: "2px 7px",
                          borderRadius: "10px",
                          background: "#fee4e2",
                          color: "#d92d20",
                          fontSize: "11px",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        fix
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SECTION B: Selected Step Fields */}
      {(SHOW_LIVE_PREVIEW ? activeTab === "edit" : viewTab === "selected") && (
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {!selectedNode ? (
            <div style={{ textAlign: "center", padding: "40px 16px", color: "#475467" }}>
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>👈</div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#344054" }}>
                Select a step to edit it, or use + on a connection to add one.
              </div>
              <button
                type="button"
                onClick={() => setViewTab("steps")}
                style={{
                  marginTop: "12px",
                  padding: "7px 14px",
                  borderRadius: "6px",
                  background: "#10b981",
                  color: "#ffffff",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <List size={13} /> View All Steps ({orderedSteps.length})
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <button
                    type="button"
                    onClick={() => setViewTab("steps")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#027a48",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: "0 0 4px 0",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    ← All steps ({orderedSteps.length})
                  </button>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#101828", margin: 0 }}>
                    Selected: {selectedStepInfo?.stepNumber} · {selectedStepInfo?.title || selectedNode.type}
                  </h3>
                  <span style={{ fontSize: "11px", color: "#667085" }}>ID: {selectedNode.id}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {onCopyNode && (
                    <button
                      type="button"
                      onClick={onCopyNode}
                      title="Copy this step to clipboard (Ctrl + C)"
                      style={{
                        padding: "6px 10px",
                        borderRadius: "6px",
                        border: "1px solid #d0d5dd",
                        background: "#ffffff",
                        color: "#344054",
                        fontSize: "11px",
                        fontWeight: 500,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Copy size={13} /> Copy Step
                    </button>
                  )}
                  {selectedNode.type !== "trigger" && (
                    <button
                      onClick={() => setShowDeleteStepModal(true)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "6px",
                        border: "1px solid #fee4e2",
                        background: "#fef3f2",
                        color: "#d92d20",
                        fontSize: "11px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Trash2 size={13} /> Delete Step
                    </button>
                  )}
                </div>
              </div>

              {/* Validation alert banner if this node has errors */}
              {selectedStepInfo?.hasError && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "#fef3f2",
                    border: "1px solid #fee4e2",
                    color: "#b42318",
                    fontSize: "12px",
                    lineHeight: 1.4,
                  }}
                >
                  <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <AlertTriangle size={14} color="#d92d20" />
                    <span>Validation issues on this step:</span>
                  </div>
                  {selectedStepInfo.errorMessages.map((msg, i) => (
                    <div key={i} style={{ marginTop: "2px" }}>• {msg}</div>
                  ))}
                </div>
              )}

              {/* Step Delete Confirmation Modal */}
              <Modal
                title={null}
                open={showDeleteStepModal}
                onCancel={() => setShowDeleteStepModal(false)}
                footer={null}
                width={420}
                centered
              >
                <div style={{ padding: "6px 2px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "14px" }}>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: "#fee4e2",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        color: "#d92d20",
                      }}
                    >
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#101828", margin: "0 0 4px 0" }}>
                        Delete Workflow Step
                      </h4>
                      <p style={{ fontSize: "12.5px", color: "#475467", margin: 0, lineHeight: 1.5 }}>
                        Are you sure you want to remove this <strong>{selectedNode.type}</strong> step (<code>{selectedNode.id}</code>)?
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#fef3f2",
                      border: "1px solid #fee4e2",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      fontSize: "11.5px",
                      color: "#b42318",
                      marginBottom: "16px",
                      lineHeight: 1.5,
                    }}
                  >
                    ⚠️ All incoming and outgoing port connections attached to this node will be removed from the workflow graph.
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setShowDeleteStepModal(false)}
                      style={{
                        padding: "7px 14px",
                        borderRadius: "6px",
                        border: "1px solid #d0d5dd",
                        background: "#ffffff",
                        color: "#344054",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeleteStepModal(false);
                        onDeleteNode(selectedNode.id);
                      }}
                      style={{
                        padding: "7px 16px",
                        borderRadius: "6px",
                        border: "1px solid #d92d20",
                        background: "#d92d20",
                        color: "#ffffff",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <Trash2 size={13} /> Delete Step
                    </button>
                  </div>
                </div>
              </Modal>

              {/* Trigger Editor */}
              {selectedNode.type === "trigger" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <label style={fieldLabelStyle}>
                    Trigger Keywords (comma-separated):
                  </label>
                  <input
                    type="text"
                    value={selectedNode.data.keyword || ""}
                    onChange={(e) => onUpdateNodeData(selectedNode.id, { keyword: e.target.value })}
                    placeholder="ORDER, TRACK, STATUS"
                    style={inputStyle}
                  />
                  <span style={{ fontSize: "11px", color: "#475467" }}>
                    Workflow starts when an incoming WhatsApp customer message matches any of these keywords.
                  </span>
                </div>
              )}

              {/* Message Editor */}
              {selectedNode.type === "message" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <label style={fieldLabelStyle}>
                    Message Text:
                  </label>
                  <textarea
                    rows={4}
                    value={selectedNode.data.text || ""}
                    onChange={(e) => onUpdateNodeData(selectedNode.id, { text: e.target.value })}
                    placeholder="Hi {{name}}! Thank you for ordering..."
                    style={textareaStyle}
                  />
                  <div style={{ fontSize: "11px", color: "#475467" }}>
                    Supports variables like <code>{`{{customer_phone}}`}</code>, <code>{`{{order_id}}`}</code>.
                  </div>
                </div>
              )}

              {/* Buttons Editor */}
              {selectedNode.type === "buttons" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={fieldLabelStyle}>
                      Plain Text Prompt & Submitted Details:
                    </label>
                    <span style={{ fontSize: "10.5px", color: (selectedNode.data.text?.length || 0) > 1000 ? "#dc2626" : "#64748b" }}>
                      {selectedNode.data.text?.length || 0}/1024 chars
                    </span>
                  </div>

                  <textarea
                    rows={6}
                    value={selectedNode.data.text || ""}
                    onChange={(e) => onUpdateNodeData(selectedNode.id, { text: e.target.value })}
                    placeholder={`Please review your submitted request:\n\n• Name: {{customer_name}}\n• Phone: {{customer_phone}}\n• Details: {{customer_input}}\n• Date/Time: {{selected_date}} at {{selected_time}}\n\nSelect an option below to proceed or cancel:`}
                    style={{
                      ...textareaStyle,
                      fontFamily: "inherit",
                      fontSize: "12px",
                      lineHeight: "1.5",
                      resize: "vertical",
                    }}
                  />

                  {/* Quick Action Helpers */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => {
                        const templateText =
                          "Please review your submitted request details:\n\n" +
                          "• Name: {{customer_name}}\n" +
                          "• Phone: {{customer_phone}}\n" +
                          "• Request: {{customer_input}}\n" +
                          "• Date/Time: {{selected_date}} at {{selected_time}}\n\n" +
                          "Would you like to proceed with this request or cancel?";
                        onUpdateNodeData(selectedNode.id, {
                          text: templateText,
                          opts: [
                            { id: "btn_proceed", title: "Proceed" },
                            { id: "btn_cancel", title: "Cancel" },
                          ],
                        });
                      }}
                      style={{
                        padding: "5px 9px",
                        borderRadius: "5px",
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        color: "#166534",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                      title="Insert formatted Review & Confirm template with Proceed and Cancel buttons"
                    >
                      📋 Insert "Proceed or Cancel" Template
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onUpdateNodeData(selectedNode.id, {
                          opts: [
                            { id: "btn_proceed", title: "Proceed" },
                            { id: "btn_cancel", title: "Cancel" },
                          ],
                        });
                      }}
                      style={{
                        padding: "5px 9px",
                        borderRadius: "5px",
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        color: "#1e40af",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                      title="Preset buttons to Proceed and Cancel"
                    >
                      ⚡ Set Proceed / Cancel Buttons
                    </button>
                  </div>

                  {/* Variable Insertion Tokens */}
                  {discoveredWorkflowVars.length > 0 && (
                    <div style={{ background: "#f8fafc", padding: "8px 10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#334155", display: "block", marginBottom: "4px" }}>
                        Click to insert submitted workflow variable:
                      </span>
                      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                        {discoveredWorkflowVars.map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              const cur = selectedNode.data.text || "";
                              const token = `{{${v}}}`;
                              onUpdateNodeData(selectedNode.id, { text: cur ? `${cur} ${token}` : token });
                            }}
                            style={{
                              padding: "2px 8px",
                              borderRadius: "12px",
                              background: "#ffffff",
                              border: "1px solid #cbd5e1",
                              color: "#0f172a",
                              fontSize: "11px",
                              fontFamily: "ui-monospace, monospace",
                              cursor: "pointer",
                            }}
                            title={`Insert {{${v}}}`}
                          >
                            + {`{{${v}}}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={fieldLabelStyle}>
                      Quick Buttons ({((selectedNode.data.opts as any[]) || []).length}/3):
                    </label>
                    {((selectedNode.data.opts as any[]) || []).length < 3 && (
                      <button
                        onClick={() => {
                          const currentOpts = (selectedNode.data.opts as any[]) || [];
                          const newOpt = { id: `btn_${Date.now()}`, title: `Option ${currentOpts.length + 1}` };
                          onUpdateNodeData(selectedNode.id, { opts: [...currentOpts, newOpt] });
                        }}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          background: "#a855f7",
                          color: "#fff",
                          border: "none",
                          fontSize: "11px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Plus size={12} /> Add Button
                      </button>
                    )}
                  </div>

                  {((selectedNode.data.opts as any[]) || []).map((opt, idx) => (
                    <div
                      key={opt.id || idx}
                      style={{
                        padding: "8px",
                        borderRadius: "6px",
                        background: "#f9fafb",
                        border: "1px solid #eaecf0",
                        display: "flex",
                        gap: "6px",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="text"
                        maxLength={120}
                        placeholder="Button text or {{variable}}"
                        value={opt.title || ""}
                        onChange={(e) => {
                          const newOpts = [...((selectedNode.data.opts as any[]) || [])];
                          newOpts[idx] = { ...opt, title: e.target.value };
                          onUpdateNodeData(selectedNode.id, { opts: newOpts });
                        }}
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          borderRadius: "4px",
                          background: "#ffffff",
                          border: "1px solid #d0d5dd",
                          color: "#101828",
                          fontSize: "11px",
                          outline: "none",
                        }}
                      />
                      <button
                        onClick={() => {
                          const newOpts = ((selectedNode.data.opts as any[]) || []).filter((_, i) => i !== idx);
                          onUpdateNodeData(selectedNode.id, { opts: newOpts });
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* List Editor */}
              {selectedNode.type === "list" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <label style={fieldLabelStyle}>
                    Menu Body Text:
                  </label>
                  <input
                    type="text"
                    value={selectedNode.data.text || ""}
                    onChange={(e) => onUpdateNodeData(selectedNode.id, { text: e.target.value })}
                    placeholder="Select an option below:"
                    style={inputStyle}
                  />

                  <label style={fieldLabelStyle}>
                    Button Label (Max 20 chars):
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={selectedNode.data.buttonText || ""}
                    onChange={(e) => onUpdateNodeData(selectedNode.id, { buttonText: e.target.value })}
                    placeholder="Select Option"
                    style={inputStyle}
                  />

                  {/* Date & Time Menu Quick Presets */}
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: "#f0f9ff",
                      border: "1px solid #bae6fd",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span
                        style={{
                          fontSize: "11.5px",
                          fontWeight: 700,
                          color: "#0369a1",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <Calendar size={14} color="#0284c7" /> Date & Time Menu Presets
                      </span>
                      <span style={{ fontSize: "10px", color: "#0284c7", fontWeight: 600 }}>1-Click Setup</span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateNodeData(selectedNode.id, {
                            is_dynamic: false,
                            text: "Please select your preferred date:",
                            buttonText: "Select Date",
                            opts: [
                              { id: "opt_today", title: "Today ({{$today}})", description: "Available today • Fast booking" },
                              { id: "opt_tomorrow", title: "Tomorrow ({{$tomorrow}})", description: "Next day appointment" },
                              { id: "opt_selected_date", title: "Selected Date", description: "Choose another custom date" },
                            ],
                          });
                          message.success("Applied 'Today, Tomorrow & Selected Date' preset");
                        }}
                        style={{
                          padding: "6px 8px",
                          borderRadius: "6px",
                          background: "#ffffff",
                          border: "1px solid #7dd3fc",
                          color: "#0369a1",
                          fontSize: "10.5px",
                          fontWeight: 600,
                          cursor: "pointer",
                          textAlign: "left",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <Calendar size={13} color="#0284c7" />
                        <div>
                          <div>Today & Tomorrow</div>
                          <div style={{ fontSize: "9px", color: "#64748b", fontWeight: 400 }}>+ Selected Date</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onUpdateNodeData(selectedNode.id, {
                            is_dynamic: false,
                            text: "Please select your preferred date & time slot:",
                            buttonText: "Choose Slot",
                            opts: [
                              { id: "opt_today_morning", title: "Today: Morning", description: "{{$today}} • 10:00 AM - 01:00 PM" },
                              { id: "opt_today_afternoon", title: "Today: Afternoon", description: "{{$today}} • 02:00 PM - 05:00 PM" },
                              { id: "opt_tomorrow_morning", title: "Tomorrow: Morning", description: "{{$tomorrow}} • 10:00 AM - 01:00 PM" },
                              { id: "opt_tomorrow_afternoon", title: "Tomorrow: Afternoon", description: "{{$tomorrow}} • 02:00 PM - 05:00 PM" },
                              { id: "opt_selected_date", title: "Selected Date", description: "Pick custom date & time" },
                            ],
                          });
                          message.success("Applied 'Date + Time Slots' preset");
                        }}
                        style={{
                          padding: "6px 8px",
                          borderRadius: "6px",
                          background: "#ffffff",
                          border: "1px solid #7dd3fc",
                          color: "#0369a1",
                          fontSize: "10.5px",
                          fontWeight: 600,
                          cursor: "pointer",
                          textAlign: "left",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <Clock size={13} color="#0284c7" />
                        <div>
                          <div>Date + Time Slots</div>
                          <div style={{ fontSize: "9px", color: "#64748b", fontWeight: 400 }}>Morning & Afternoon</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onUpdateNodeData(selectedNode.id, {
                            is_dynamic: false,
                            text: "Please choose a convenient time slot:",
                            buttonText: "Select Time",
                            opts: [
                              { id: "slot_10am_12pm", title: "10:00 AM - 12:00 PM", description: "Morning slot" },
                              { id: "slot_02pm_04pm", title: "02:00 PM - 04:00 PM", description: "Afternoon slot" },
                              { id: "slot_04pm_06pm", title: "04:00 PM - 06:00 PM", description: "Late afternoon slot" },
                              { id: "slot_06pm_08pm", title: "06:00 PM - 08:00 PM", description: "Evening slot" },
                              { id: "slot_custom", title: "Custom Time", description: "Specify a custom time" },
                            ],
                          });
                          message.success("Applied 'Time Slots Only' preset");
                        }}
                        style={{
                          padding: "6px 8px",
                          borderRadius: "6px",
                          background: "#ffffff",
                          border: "1px solid #7dd3fc",
                          color: "#0369a1",
                          fontSize: "10.5px",
                          fontWeight: 600,
                          cursor: "pointer",
                          textAlign: "left",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          gridColumn: "span 2",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <Clock size={13} color="#0284c7" />
                        <div>
                          <div>Time Slots Only</div>
                          <div style={{ fontSize: "9px", color: "#64748b", fontWeight: 400 }}>Morning, Afternoon, Evening & Custom</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Dynamic Rows Toggle & Intelligent API Auto-Detection */}
                  {(() => {
                    const apiNode =
                      graph.nodes.find((n) => graph.edges.some((e) => e.to === selectedNode.id && e.from === n.id)) ||
                      graph.nodes.find((n) => n.type === "api");
                    const saveVar = apiNode?.data?.save || "api_result";
                    const apiResponse =
                      apiNode?.data?.last_response ||
                      testApiResult?.json ||
                      simContext[saveVar];
                    const analysis = analyzeApiResponse(saveVar, apiResponse);
                    const currentArray =
                      analysis.arrays.find(
                        (a) =>
                          a.fullToken === selectedNode.data.array_path ||
                          a.path === selectedNode.data.array_path
                      ) || analysis.primaryArray;
                    const availableKeys =
                      currentArray?.keys ||
                      (currentArray?.sampleItem ? Object.keys(currentArray.sampleItem) : []);
                    const sampleItem = currentArray?.sampleItem;

                    const resolvePreviewField = (fieldStr?: string) => {
                      if (!fieldStr || !sampleItem) return "";
                      const trimmed = fieldStr.trim();
                      if (trimmed.includes("{{")) {
                        return interpolateString(trimmed, { item: sampleItem, index: 0, idx: 1 });
                      }
                      const val = sampleItem[trimmed];
                      if (val !== undefined && val !== null) {
                        return typeof val === "object" ? JSON.stringify(val) : String(val);
                      }
                      return "";
                    };

                    const sampleRowTitle =
                      resolvePreviewField(selectedNode.data.title_field || currentArray?.bestTitle) ||
                      (sampleItem?.title || sampleItem?.name || sampleItem?.product_name || "Sample Option");
                    const sampleRowDesc =
                      resolvePreviewField(selectedNode.data.description_field || currentArray?.bestDesc) ||
                      (sampleItem?.description || sampleItem?.category || "");
                    const sampleRowId =
                      resolvePreviewField(selectedNode.data.id_field || currentArray?.bestId) ||
                      (sampleItem?.id || "opt_1");

                    const handleAutoFill = async () => {
                      let targetResponse = apiResponse;
                      if (!targetResponse && apiNode?.data?.url) {
                        message.loading({ content: "Fetching live response from API step...", key: "dyn_fetch" });
                        targetResponse = await handleTestApi(undefined, apiNode.id);
                      }
                      const fresh = analyzeApiResponse(saveVar, targetResponse);
                      if (fresh.primaryArray) {
                        const p = fresh.primaryArray;
                        onUpdateNodeData(selectedNode.id, {
                          array_path: p.fullToken,
                          title_field: p.bestTitle,
                          description_field: p.bestDesc,
                          id_field: p.bestId,
                          empty_fallback_text: "No options currently available.",
                        });
                        message.success({
                          content: `Auto-filled from ${p.fullToken} (${p.length} items): Title="${p.bestTitle}", Description="${p.bestDesc}", ID="${p.bestId}"`,
                          key: "dyn_fetch",
                          duration: 4,
                        });
                      } else {
                        message.info({
                          content: apiNode?.data?.url
                            ? "API request completed, but no arrays were found in response."
                            : "Configure and test an API step first to detect fields automatically.",
                          key: "dyn_fetch",
                        });
                      }
                    };

                    return (
                      <>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 12px",
                            background: selectedNode.data.is_dynamic ? "#f0fdf4" : "#f8fafc",
                            border: `1px solid ${selectedNode.data.is_dynamic ? "#86efac" : "#e2e8f0"}`,
                            borderRadius: "8px",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: "12px",
                                fontWeight: 700,
                                color: selectedNode.data.is_dynamic ? "#166534" : "#334155",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <Sparkles size={14} color={selectedNode.data.is_dynamic ? "#16a34a" : "#64748b"} />
                              Dynamic Rows from Context Array
                            </div>
                            <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                              Populate WhatsApp list items dynamically from API response
                            </div>
                          </div>
                          <label style={{ position: "relative", display: "inline-block", width: "38px", height: "20px", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={Boolean(selectedNode.data.is_dynamic)}
                              onChange={(e) => {
                                const isDyn = e.target.checked;
                                const updates: any = { is_dynamic: isDyn };
                                if (isDyn && !selectedNode.data.array_path) {
                                  if (analysis.primaryArray) {
                                    updates.array_path = analysis.primaryArray.fullToken;
                                    updates.title_field = analysis.primaryArray.bestTitle;
                                    updates.description_field = analysis.primaryArray.bestDesc;
                                    updates.id_field = analysis.primaryArray.bestId;
                                  } else {
                                    updates.array_path = `{{${saveVar}.products}}`;
                                    updates.title_field = "title";
                                    updates.description_field = "description";
                                    updates.id_field = "id";
                                  }
                                  updates.empty_fallback_text = "No options currently available.";
                                }
                                onUpdateNodeData(selectedNode.id, updates);
                              }}
                              style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: selectedNode.data.is_dynamic ? "#0f9d7a" : "#cbd5e1",
                                borderRadius: "20px",
                                transition: ".3s",
                              }}
                            >
                              <span
                                style={{
                                  position: "absolute",
                                  content: '""',
                                  height: "14px",
                                  width: "14px",
                                  left: selectedNode.data.is_dynamic ? "20px" : "3px",
                                  bottom: "3px",
                                  backgroundColor: "white",
                                  borderRadius: "50%",
                                  transition: ".3s",
                                }}
                              />
                            </span>
                          </label>
                        </div>

                        {selectedNode.data.is_dynamic ? (
                          /* Dynamic Rows Configuration */
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "10px",
                              padding: "12px",
                              background: "#f0fdf4",
                              border: "1px solid #bbf7d0",
                              borderRadius: "8px",
                            }}
                          >
                            {/* Connected API Node Info Card */}
                            <div
                              style={{
                                padding: "8px 10px",
                                background: "#ffffff",
                                border: "1px solid #bbf7d0",
                                borderRadius: "6px",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: "8px",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Zap size={14} color="#0f766e" />
                                <div>
                                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f766e" }}>
                                    {apiNode ? `API: ${apiNode.data?.title || apiNode.id}` : "No API step in flow"}
                                  </div>
                                  <div style={{ fontSize: "10px", color: "#64748b" }}>
                                    Context: <code>{`{{${saveVar}}}`}</code>
                                    {currentArray ? ` • ${currentArray.length} items detected` : ""}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={testingApi}
                                onClick={handleAutoFill}
                                style={{
                                  fontSize: "10.5px",
                                  padding: "3px 8px",
                                  borderRadius: "5px",
                                  background: "#dcfce7",
                                  color: "#15803d",
                                  border: "1px solid #86efac",
                                  cursor: testingApi ? "not-allowed" : "pointer",
                                  fontWeight: 700,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                <Sparkles size={12} />
                                {testingApi ? "Detecting..." : "⚡ Auto-Detect Fields"}
                              </button>
                            </div>

                            {/* Context Array Selector */}
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <label style={fieldLabelStyle}>Context Array (e.g. {"{{api_result.products}}"}):</label>
                              </div>
                              <input
                                type="text"
                                placeholder={`e.g. {{${saveVar}.products}} or {{${saveVar}.data}}`}
                                value={selectedNode.data.array_path || ""}
                                onChange={(e) => onUpdateNodeData(selectedNode.id, { array_path: e.target.value })}
                                style={inputStyle}
                              />
                              {analysis.arrays.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "5px" }}>
                                  <span style={{ fontSize: "10px", color: "#0f766e", fontWeight: 600, alignSelf: "center" }}>
                                    Detected Arrays:
                                  </span>
                                  {analysis.arrays.map((arr) => {
                                    const isSel = selectedNode.data.array_path === arr.fullToken || selectedNode.data.array_path === arr.path;
                                    return (
                                      <button
                                        key={arr.fullToken}
                                        type="button"
                                        onClick={() => {
                                          onUpdateNodeData(selectedNode.id, {
                                            array_path: arr.fullToken,
                                            title_field: arr.bestTitle,
                                            description_field: arr.bestDesc,
                                            id_field: arr.bestId,
                                          });
                                          message.success(`Bound to ${arr.fullToken} (Title: ${arr.bestTitle}, Desc: ${arr.bestDesc}, ID: ${arr.bestId})`);
                                        }}
                                        style={{
                                          padding: "2px 7px",
                                          borderRadius: "4px",
                                          background: isSel ? "#0f766e" : "#ffffff",
                                          color: isSel ? "#ffffff" : "#0f766e",
                                          border: `1px solid ${isSel ? "#0f766e" : "#86efac"}`,
                                          fontSize: "10px",
                                          fontWeight: 600,
                                          cursor: "pointer",
                                        }}
                                      >
                                        {arr.fullToken} ({arr.length})
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              <span style={{ fontSize: "10px", color: "#4b5563", marginTop: "2px", display: "block" }}>
                                Points to the context array. Meta WhatsApp displays up to 10 items.
                              </span>
                            </div>

                            {/* Detected Object Keys from array[0] */}
                            {availableKeys.length > 0 && (
                              <div
                                style={{
                                  padding: "8px 10px",
                                  background: "#f8fafc",
                                  borderRadius: "6px",
                                  border: "1px dashed #cbd5e1",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "10.5px",
                                    fontWeight: 700,
                                    color: "#334155",
                                    marginBottom: "5px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                >
                                  <span>📦 Fields found in <code>{currentArray?.path || "item"}[0]</code>:</span>
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                                  {availableKeys.map((k) => (
                                    <span
                                      key={k}
                                      style={{
                                        padding: "2px 6px",
                                        borderRadius: "4px",
                                        background: "#e2e8f0",
                                        color: "#1e293b",
                                        fontSize: "10px",
                                        fontFamily: "monospace",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {k}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Row Title Field */}
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                <label style={fieldLabelStyle}>Row Title Field (Max 24 chars):</label>
                              </div>
                              <input
                                type="text"
                                placeholder="e.g. title or name or product_name"
                                value={selectedNode.data.title_field || ""}
                                onChange={(e) => onUpdateNodeData(selectedNode.id, { title_field: e.target.value })}
                                style={inputStyle}
                              />
                              {availableKeys.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                                  <span style={{ fontSize: "9.5px", color: "#64748b", alignSelf: "center" }}>Click key:</span>
                                  {availableKeys.map((k) => {
                                    const isSel = selectedNode.data.title_field === k;
                                    return (
                                      <button
                                        key={k}
                                        type="button"
                                        onClick={() => onUpdateNodeData(selectedNode.id, { title_field: k })}
                                        style={{
                                          padding: "1px 5px",
                                          borderRadius: "3px",
                                          background: isSel ? "#0284c7" : "#ffffff",
                                          color: isSel ? "#ffffff" : "#0369a1",
                                          border: `1px solid ${isSel ? "#0284c7" : "#bae6fd"}`,
                                          fontSize: "9.5px",
                                          fontFamily: "monospace",
                                          cursor: "pointer",
                                          fontWeight: isSel ? 700 : 500,
                                        }}
                                      >
                                        {k}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              <span style={{ fontSize: "10px", color: "#4b5563" }}>
                                Truncated to 24 chars automatically for WhatsApp compatibility.
                              </span>
                            </div>

                            {/* Row Description Field */}
                            <div>
                              <label style={fieldLabelStyle}>Row Description Field (Optional, Max 72 chars):</label>
                              <input
                                type="text"
                                placeholder="e.g. description or category or price"
                                value={selectedNode.data.description_field || ""}
                                onChange={(e) => onUpdateNodeData(selectedNode.id, { description_field: e.target.value })}
                                style={inputStyle}
                              />
                              {availableKeys.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                                  <span style={{ fontSize: "9.5px", color: "#64748b", alignSelf: "center" }}>Click key:</span>
                                  {availableKeys.map((k) => {
                                    const isSel = selectedNode.data.description_field === k;
                                    return (
                                      <button
                                        key={k}
                                        type="button"
                                        onClick={() => onUpdateNodeData(selectedNode.id, { description_field: k })}
                                        style={{
                                          padding: "1px 5px",
                                          borderRadius: "3px",
                                          background: isSel ? "#0284c7" : "#ffffff",
                                          color: isSel ? "#ffffff" : "#0369a1",
                                          border: `1px solid ${isSel ? "#0284c7" : "#bae6fd"}`,
                                          fontSize: "9.5px",
                                          fontFamily: "monospace",
                                          cursor: "pointer",
                                          fontWeight: isSel ? 700 : 500,
                                        }}
                                      >
                                        {k}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              <span style={{ fontSize: "10px", color: "#4b5563" }}>
                                Truncated to 72 chars automatically for WhatsApp compatibility.
                              </span>
                            </div>

                            {/* Row ID Field */}
                            <div>
                              <label style={fieldLabelStyle}>Row ID Field (Optional):</label>
                              <input
                                type="text"
                                placeholder="e.g. id or sku or key or opt_{{index}}"
                                value={selectedNode.data.id_field || ""}
                                onChange={(e) => onUpdateNodeData(selectedNode.id, { id_field: e.target.value })}
                                style={inputStyle}
                              />
                              {availableKeys.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                                  <span style={{ fontSize: "9.5px", color: "#64748b", alignSelf: "center" }}>Click key:</span>
                                  {availableKeys.map((k) => {
                                    const isSel = selectedNode.data.id_field === k;
                                    return (
                                      <button
                                        key={k}
                                        type="button"
                                        onClick={() => onUpdateNodeData(selectedNode.id, { id_field: k })}
                                        style={{
                                          padding: "1px 5px",
                                          borderRadius: "3px",
                                          background: isSel ? "#0284c7" : "#ffffff",
                                          color: isSel ? "#ffffff" : "#0369a1",
                                          border: `1px solid ${isSel ? "#0284c7" : "#bae6fd"}`,
                                          fontSize: "9.5px",
                                          fontFamily: "monospace",
                                          cursor: "pointer",
                                          fontWeight: isSel ? 700 : 500,
                                        }}
                                      >
                                        {k}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              <span style={{ fontSize: "10px", color: "#4b5563" }}>
                                Sent when user selects the row. Made unique automatically if duplicate.
                              </span>
                            </div>

                            {/* Live WhatsApp Preview Card */}
                            {sampleItem && (
                              <div
                                style={{
                                  padding: "9px 11px",
                                  background: "#ecfdf5",
                                  border: "1px solid #a7f3d0",
                                  borderRadius: "7px",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "5px",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    color: "#065f46",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                  }}
                                >
                                  <span>📱 WhatsApp List Preview (Item 1 of {currentArray?.length || 1}):</span>
                                  <span style={{ fontSize: "9.5px", color: "#047857", fontWeight: 600 }}>Live Output</span>
                                </div>
                                <div
                                  style={{
                                    background: "#ffffff",
                                    padding: "8px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid #d1fae5",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "3px",
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#111827" }}>
                                      {sampleRowTitle.slice(0, 24) || "(No Title)"}
                                    </span>
                                    <span style={{ fontSize: "9.5px", color: sampleRowTitle.length > 24 ? "#dc2626" : "#059669", fontWeight: 600 }}>
                                      {sampleRowTitle.length > 24 ? `Truncated to 24 chars` : `${sampleRowTitle.length}/24 chars`}
                                    </span>
                                  </div>
                                  {sampleRowDesc && (
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                      <span style={{ fontSize: "11px", color: "#4b5563" }}>
                                        {sampleRowDesc.slice(0, 72)}
                                      </span>
                                      <span style={{ fontSize: "9.5px", color: sampleRowDesc.length > 72 ? "#dc2626" : "#059669", fontWeight: 600 }}>
                                        {sampleRowDesc.length > 72 ? `Truncated to 72 chars` : `${sampleRowDesc.length}/72 chars`}
                                      </span>
                                    </div>
                                  )}
                                  <div style={{ fontSize: "10px", color: "#0f766e", marginTop: "3px", fontWeight: 600 }}>
                                    ID value: <code>{sampleRowId || "(empty)"}</code>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Empty Fallback Message */}
                            <div>
                              <label style={fieldLabelStyle}>Empty Array Fallback Message:</label>
                              <textarea
                                rows={2}
                                placeholder="e.g. No options are currently available."
                                value={selectedNode.data.empty_fallback_text || ""}
                                onChange={(e) => onUpdateNodeData(selectedNode.id, { empty_fallback_text: e.target.value })}
                                style={textareaStyle}
                              />
                              <span style={{ fontSize: "10px", color: "#4b5563" }}>
                                Sent as a plain text message if the array is empty.
                              </span>
                            </div>

                            <div style={{ borderTop: "1px solid #bbf7d0", paddingTop: "8px", marginTop: "4px" }}>
                              <label style={fieldLabelStyle}>Save Selected Row to Context:</label>
                              <div style={{ display: "flex", gap: "8px" }}>
                                <div style={{ flex: 1 }}>
                                  <span style={{ fontSize: "10px", color: "#374151", fontWeight: 500 }}>ID variable:</span>
                                  <input
                                    type="text"
                                    placeholder="selected_row_id"
                                    value={selectedNode.data.save_row_id_to || ""}
                                    onChange={(e) => onUpdateNodeData(selectedNode.id, { save_row_id_to: e.target.value })}
                                    style={{ ...inputStyle, fontSize: "11px", padding: "4px 8px" }}
                                  />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <span style={{ fontSize: "10px", color: "#374151", fontWeight: 500 }}>Title variable:</span>
                                  <input
                                    type="text"
                                    placeholder="selected_row_title"
                                    value={selectedNode.data.save_row_title_to || ""}
                                    onChange={(e) => onUpdateNodeData(selectedNode.id, { save_row_title_to: e.target.value })}
                                    style={{ ...inputStyle, fontSize: "11px", padding: "4px 8px" }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Static Rows Configuration */
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <label style={fieldLabelStyle}>
                            List Rows ({((selectedNode.data.opts as any[]) || []).length}/10):
                          </label>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                            {((selectedNode.data.opts as any[]) || []).length < 10 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentOpts = (selectedNode.data.opts as any[]) || [];
                                    const newOpt = {
                                      id: "opt_today",
                                      title: "Today ({{$today}})",
                                      description: "Available today",
                                    };
                                    onUpdateNodeData(selectedNode.id, { opts: [...currentOpts, newOpt] });
                                    message.success("Added 'Today' row");
                                  }}
                                  style={{
                                    padding: "3px 6px",
                                    borderRadius: "4px",
                                    background: "#e0f2fe",
                                    color: "#0369a1",
                                    border: "1px solid #bae6fd",
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "3px",
                                  }}
                                  title="Add Today row with dynamic date token"
                                >
                                  + Today
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentOpts = (selectedNode.data.opts as any[]) || [];
                                    const newOpt = {
                                      id: "opt_tomorrow",
                                      title: "Tomorrow ({{$tomorrow}})",
                                      description: "Available tomorrow",
                                    };
                                    onUpdateNodeData(selectedNode.id, { opts: [...currentOpts, newOpt] });
                                    message.success("Added 'Tomorrow' row");
                                  }}
                                  style={{
                                    padding: "3px 6px",
                                    borderRadius: "4px",
                                    background: "#e0f2fe",
                                    color: "#0369a1",
                                    border: "1px solid #bae6fd",
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "3px",
                                  }}
                                  title="Add Tomorrow row with dynamic date token"
                                >
                                  + Tomorrow
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentOpts = (selectedNode.data.opts as any[]) || [];
                                    const newOpt = {
                                      id: "opt_selected_date",
                                      title: "Selected Date",
                                      description: "Choose another date",
                                    };
                                    onUpdateNodeData(selectedNode.id, { opts: [...currentOpts, newOpt] });
                                    message.success("Added 'Selected Date' row");
                                  }}
                                  style={{
                                    padding: "3px 6px",
                                    borderRadius: "4px",
                                    background: "#e0f2fe",
                                    color: "#0369a1",
                                    border: "1px solid #bae6fd",
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "3px",
                                  }}
                                  title="Add custom date row"
                                >
                                  + Pick Date
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentOpts = (selectedNode.data.opts as any[]) || [];
                                    const newOpt = {
                                      id: `row_${Date.now()}`,
                                      title: `Row ${currentOpts.length + 1}`,
                                      description: "",
                                    };
                                    onUpdateNodeData(selectedNode.id, { opts: [...currentOpts, newOpt] });
                                  }}
                                  style={{
                                    padding: "3px 6px",
                                    borderRadius: "4px",
                                    background: "#0ea5e9",
                                    color: "#fff",
                                    border: "none",
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "3px",
                                  }}
                                >
                                  <Plus size={11} /> Row
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Date and Variable Helper Pills */}
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "4px",
                            padding: "6px 8px",
                            background: "#f8fafc",
                            borderRadius: "6px",
                            border: "1px dashed #cbd5e1",
                            alignItems: "center",
                          }}
                        >
                          <span style={{ fontSize: "10px", fontWeight: 600, color: "#64748b" }}>Tokens:</span>
                          {[
                            { token: "{{$today}}", label: "e.g. Tue, Nov 17" },
                            { token: "{{$tomorrow}}", label: "e.g. Wed, Nov 18" },
                            { token: "{{$today_date}}", label: "YYYY-MM-DD" },
                            { token: "{{$tomorrow_date}}", label: "Tomorrow ISO" },
                            { token: "{{$time}}", label: "Current Time" },
                          ].map((t) => (
                            <button
                              key={t.token}
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(t.token);
                                message.success(`Copied ${t.token} (${t.label})`);
                              }}
                              title={`Click to copy ${t.token} (${t.label})`}
                              style={{
                                padding: "2px 5px",
                                borderRadius: "4px",
                                background: "#ffffff",
                                border: "1px solid #e2e8f0",
                                color: "#0369a1",
                                fontSize: "10px",
                                fontFamily: "monospace",
                                cursor: "pointer",
                              }}
                            >
                              {t.token}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* <span style={{ fontSize: "10.5px", color: "#64748b", display: "block", marginTop: "-4px" }}>
                        💡 Variables like <code>{"{{api_result.response[0].ip_address}}"}</code> are automatically resolved.
                      </span> */}

                      {((selectedNode.data.opts as any[]) || []).map((opt, idx) => (
                        <div
                          key={opt.id || idx}
                          style={{
                            padding: "8px",
                            borderRadius: "6px",
                            background: "#f9fafb",
                            border: "1px solid #eaecf0",
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        >
                          <div style={{ display: "flex", gap: "6px" }}>
                            <input
                              type="text"
                              maxLength={120}
                              placeholder="Title (Max 24 chars)"
                              value={opt.title || ""}
                              onChange={(e) => {
                                const newOpts = [...((selectedNode.data.opts as any[]) || [])];
                                newOpts[idx] = { ...opt, title: e.target.value };
                                onUpdateNodeData(selectedNode.id, { opts: newOpts });
                              }}
                              style={{
                                flex: 1,
                                padding: "4px 8px",
                                borderRadius: "4px",
                                background: "#ffffff",
                                border: "1px solid #d0d5dd",
                                color: "#101828",
                                fontSize: "11px",
                                outline: "none",
                              }}
                            />
                            <button
                              onClick={() => {
                                const newOpts = ((selectedNode.data.opts as any[]) || []).filter((_, i) => i !== idx);
                                onUpdateNodeData(selectedNode.id, { opts: newOpts });
                              }}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#ef4444",
                                cursor: "pointer",
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <input
                            type="text"
                            maxLength={120}
                            placeholder="Description (optional, max 72)"
                            value={opt.description || ""}
                            onChange={(e) => {
                              const newOpts = [...((selectedNode.data.opts as any[]) || [])];
                              newOpts[idx] = { ...opt, description: e.target.value };
                              onUpdateNodeData(selectedNode.id, { opts: newOpts });
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "4px",
                              background: "#ffffff",
                              border: "1px solid #d0d5dd",
                              color: "#475467",
                              fontSize: "10px",
                              outline: "none",
                            }}
                          />
                        </div>
                      ))}

                      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px", marginTop: "4px" }}>
                        <label style={fieldLabelStyle}>Save Selected Row to Context:</label>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: "10px", color: "#374151", fontWeight: 500 }}>ID variable:</span>
                            <input
                              type="text"
                              placeholder="selected_row_id"
                              value={selectedNode.data.save_row_id_to || ""}
                              onChange={(e) => onUpdateNodeData(selectedNode.id, { save_row_id_to: e.target.value })}
                              style={{ ...inputStyle, fontSize: "11px", padding: "4px 8px" }}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: "10px", color: "#374151", fontWeight: 500 }}>Title variable:</span>
                            <input
                              type="text"
                              placeholder="selected_row_title"
                              value={selectedNode.data.save_row_title_to || ""}
                              onChange={(e) => onUpdateNodeData(selectedNode.id, { save_row_title_to: e.target.value })}
                              style={{ ...inputStyle, fontSize: "11px", padding: "4px 8px" }}
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}

              {/* Ask Question Editor */}
              {selectedNode.type === "ask" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <label style={fieldLabelStyle}>
                    Question Prompt:
                  </label>
                  <textarea
                    rows={3}
                    value={selectedNode.data.text || ""}
                    onChange={(e) => onUpdateNodeData(selectedNode.id, { text: e.target.value })}
                    placeholder="Please enter your email address:"
                    style={textareaStyle}
                  />

                  <label style={fieldLabelStyle}>
                    Store Response into Variable:
                  </label>
                  <input
                    type="text"
                    value={selectedNode.data.var || ""}
                    onChange={(e) => onUpdateNodeData(selectedNode.id, { var: e.target.value })}
                    placeholder="customer_email"
                    style={inputStyle}
                  />

                  {/* Validation Kind Dropdown with Legacy Tolerance */}
                  {(() => {
                    const rawKind = selectedNode.data.kind || "text";
                    const isKnownKind = (ASK_KINDS as readonly string[]).includes(rawKind);
                    const normalizedKind = normalizeAskKind(rawKind);

                    return (
                      <>
                        <label style={fieldLabelStyle}>Validation Kind:</label>
                        {!isKnownKind && (
                          <div
                            style={{
                              padding: "6px 8px",
                              marginBottom: "6px",
                              borderRadius: "6px",
                              background: "#fef3c7",
                              border: "1px solid #fde68a",
                              color: "#92400e",
                              fontSize: "11px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <span>⚠️ Unrecognized kind: <code>{rawKind}</code></span>
                            <button
                              type="button"
                              onClick={() => onUpdateNodeData(selectedNode.id, { kind: normalizedKind })}
                              style={{
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: "#d97706",
                                color: "#ffffff",
                                border: "none",
                                fontSize: "10px",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Migrate to {normalizedKind}
                            </button>
                          </div>
                        )}
                        <select
                          value={isKnownKind ? rawKind : normalizedKind}
                          onChange={(e) => onUpdateNodeData(selectedNode.id, { kind: e.target.value })}
                          style={selectStyle}
                        >
                          {!isKnownKind && (
                            <option value={rawKind} disabled style={{ background: "#ffffff", color: "#b45309" }}>
                              ⚠️ {rawKind} (Legacy - mapped to {normalizedKind})
                            </option>
                          )}
                          {ASK_KINDS.map((k) => (
                            <option key={k} value={k} style={{ background: "#ffffff", color: "#101828" }}>
                              {ASK_KIND_LABELS[k] || k}
                            </option>
                          ))}
                        </select>
                      </>
                    );
                  })()}

                  {/* Component Preview for Date / Time */}
                  {selectedNode.data.kind === "date" && (
                    <div style={{ marginTop: "6px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#0f766e", display: "block", marginBottom: "4px" }}>
                        📅 Calendar Component Preview:
                      </span>
                      <CalendarPicker
                        inline
                        onSelect={(isoDate, formatted) => {
                          message.info(`Selected date: ${formatted} (${isoDate})`);
                        }}
                      />
                    </div>
                  )}

                  {selectedNode.data.kind === "time" && (
                    <div style={{ marginTop: "6px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#0284c7", display: "block", marginBottom: "4px" }}>
                        ⏰ Time Component Preview:
                      </span>
                      <TimePicker
                        inline
                        onSelect={(timeStr) => {
                          message.info(`Selected time: ${timeStr}`);
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* API Editor */}
              {selectedNode.type === "api" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={fieldLabelStyle}>
                      HTTP Method:
                    </label>
                    <select
                      value={selectedNode.data.method || "GET"}
                      onChange={(e) => onUpdateNodeData(selectedNode.id, { method: e.target.value })}
                      style={selectStyle}
                    >
                      <option value="GET" style={{ background: "#ffffff", color: "#101828" }}>GET</option>
                      <option value="POST" style={{ background: "#ffffff", color: "#101828" }}>POST</option>
                      <option value="PUT" style={{ background: "#ffffff", color: "#101828" }}>PUT</option>
                      <option value="PATCH" style={{ background: "#ffffff", color: "#101828" }}>PATCH</option>
                      <option value="DELETE" style={{ background: "#ffffff", color: "#101828" }}>DELETE</option>
                    </select>
                  </div>

                  <div>
                    <label style={fieldLabelStyle}>
                      Endpoint URL:
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data.url || ""}
                      onChange={(e) => onUpdateNodeData(selectedNode.id, { url: e.target.value })}
                      placeholder="https://varmatec.in/api/data"
                      style={inputStyle}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                      <span style={{ fontSize: "10.5px", color: "#0f9d7a" }}>
                        Host must be allowlisted in Webhook Allowlist.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          let h = "";
                          try {
                            if (selectedNode.data.url) {
                              const raw = selectedNode.data.url.trim();
                              const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
                              h = u.hostname;
                            }
                          } catch {}
                          setAllowlistInitialHost(h);
                          setAllowlistModalOpen(true);
                        }}
                        style={{
                          fontSize: "11px",
                          color: "#0f766e",
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          fontWeight: 600,
                          textDecoration: "underline",
                        }}
                      >
                        + Add / Manage Allowlist
                      </button>
                    </div>
                  </div>

                  {/* Authorization Header */}
                  <div>
                    <label style={{ ...fieldLabelStyle, display: "flex", alignItems: "center", gap: "6px" }}>
                      <Key size={13} color="#f59e0b" /> Authorization (Optional):
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data.authorization || ""}
                      onChange={(e) => onUpdateNodeData(selectedNode.id, { authorization: e.target.value })}
                      placeholder="Bearer your_token_here or Api-Key xyz"
                      style={inputStyle}
                    />
                  </div>

                  {/* Content-Type for POST, PUT, PATCH */}
                  {["POST", "PUT", "PATCH"].includes((selectedNode.data.method || "GET").toUpperCase()) && (
                    <div>
                      <label style={fieldLabelStyle}>
                        Content-Type:
                      </label>
                      <select
                        value={selectedNode.data.contentType || "application/json"}
                        onChange={(e) => onUpdateNodeData(selectedNode.id, { contentType: e.target.value })}
                        style={selectStyle}
                      >
                        <option value="application/json" style={{ background: "#ffffff", color: "#101828" }}>application/json</option>
                        <option value="application/x-www-form-urlencoded" style={{ background: "#ffffff", color: "#101828" }}>application/x-www-form-urlencoded</option>
                        <option value="text/plain" style={{ background: "#ffffff", color: "#101828" }}>text/plain</option>
                      </select>
                    </div>
                  )}

                  {/* Request Body for POST, PUT, PATCH */}
                  {["POST", "PUT", "PATCH"].includes((selectedNode.data.method || "GET").toUpperCase()) && (
                    <div>
                      <label style={{ ...fieldLabelStyle, display: "flex", alignItems: "center", gap: "6px" }}>
                        <Code size={13} color="#0284c7" /> Request Body:
                      </label>
                      <textarea
                        rows={4}
                        value={selectedNode.data.body || ""}
                        onChange={(e) => onUpdateNodeData(selectedNode.id, { body: e.target.value })}
                        placeholder={`{\n  "order_id": "{{order_id}}",\n  "phone": "{{customer_phone}}"\n}`}
                        style={{
                          ...textareaStyle,
                          fontFamily: "ui-monospace, monospace",
                          color: "#101828",
                        }}
                      />
                      <span style={{ fontSize: "10px", color: "#475467", display: "block", marginTop: "2px" }}>
                        Supports variable tokens: <code>{"{{order_id}}"}</code>, <code>{"{{customer_phone}}"}</code>
                      </span>
                    </div>
                  )}

                  <div>
                    <label style={fieldLabelStyle}>
                      Save Response JSON to Context Variable:
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data.save || ""}
                      onChange={(e) => onUpdateNodeData(selectedNode.id, { save: e.target.value })}
                      placeholder="api_result"
                      style={inputStyle}
                    />
                  </div>

                  {/* Live Real-Time API Test & Fetch Button */}
                  <div style={{ marginTop: "4px" }}>
                    <button
                      type="button"
                      disabled={testingApi || !selectedNode.data.url}
                      onClick={() => handleTestApi()}
                      style={{
                        width: "100%",
                        padding: "9px 14px",
                        borderRadius: "8px",
                        background: "linear-gradient(135deg, #0f766e, #0d9488)",
                        border: "1px solid #14b8a6",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: testingApi || !selectedNode.data.url ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        boxShadow: "0 2px 8px rgba(13, 148, 136, 0.25)",
                        opacity: testingApi || !selectedNode.data.url ? 0.6 : 1,
                      }}
                    >
                      <Zap size={15} color="#fef08a" />
                      {testingApi ? "Fetching Live Data..." : "⚡ Test Request & Fetch Live Response"}
                    </button>
                  </div>

                  {/* Live Test Response Panel */}
                  {testApiResult && (
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        background: testApiResult.error ? "rgba(239, 68, 68, 0.1)" : "rgba(16, 185, 129, 0.1)",
                        border: testApiResult.error ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)",
                      }}
                    >
                      {testApiResult.error ? (
                        <div>
                          <div style={{ color: "#ef4444", fontWeight: 700, fontSize: "12px", marginBottom: "4px" }}>
                            ✕ Request Failed
                          </div>
                          <div style={{ color: "#b91c1c", fontSize: "11.5px", lineHeight: "1.4" }}>
                            {testApiResult.error}
                          </div>
                          {testApiResult.isAllowlistError && (
                            <div
                              style={{
                                marginTop: "10px",
                                padding: "10px 12px",
                                borderRadius: "8px",
                                background: "#fffbeb",
                                border: "1px solid #fde047",
                              }}
                            >
                              <div style={{ fontSize: "11.5px", color: "#854d0e", marginBottom: "8px", lineHeight: "1.4" }}>
                                🛡️ Host <strong>{testApiResult.hostname}</strong> is not yet allowlisted for outbound HTTP requests.
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                <button
                                  type="button"
                                  disabled={addingHostQuickly}
                                  onClick={() => handleQuickAddAllowlist(testApiResult.hostname || "")}
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: "6px",
                                    background: "#0f9d7a",
                                    border: "none",
                                    color: "#ffffff",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    cursor: addingHostQuickly ? "not-allowed" : "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                                  }}
                                >
                                  <ShieldCheck size={13} />
                                  {addingHostQuickly ? "Allowlisting & Retesting..." : `+ Add "${testApiResult.hostname}" to Allowlist`}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAllowlistInitialHost(testApiResult.hostname || "");
                                    setAllowlistModalOpen(true);
                                  }}
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: "6px",
                                    background: "#ffffff",
                                    border: "1px solid #d1d5db",
                                    color: "#374151",
                                    fontSize: "11px",
                                    fontWeight: 500,
                                    cursor: "pointer",
                                  }}
                                >
                                  Manage Allowlist
                                </button>
                                <a
                                  href="/webhooks"
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: "6px",
                                    background: "#ffffff",
                                    border: "1px solid #d1d5db",
                                    color: "#374151",
                                    fontSize: "11px",
                                    fontWeight: 500,
                                    textDecoration: "none",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                >
                                  Open Webhooks Console <ExternalLink size={11} />
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                            <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#10b981" }}>
                              ✓ Status: {testApiResult.status} {testApiResult.statusText}
                            </span>
                            <span style={{ fontSize: "10px", color: "#a1a1aa" }}>
                              {testApiResult.durationMs}ms
                            </span>
                          </div>

                          {testApiResult.fields && testApiResult.fields.length > 0 ? (
                            <div>
                              <div style={{ fontSize: "11px", fontWeight: 600, color: "#101828", marginBottom: "6px" }}>
                                📦 Available Response Fields (Drag or Click to Copy):
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "6px",
                                  maxHeight: "180px",
                                  overflowY: "auto",
                                  padding: "6px",
                                  background: "#f1f5f9",
                                  borderRadius: "6px",
                                }}
                              >
                                {testApiResult.fields.map((f) => {
                                  const savePrefix = selectedNode.data.save ? `${selectedNode.data.save}.` : "";
                                  const tokenText = `{{${savePrefix}${f.path}}}`;
                                  const isCopied = copiedField === tokenText;

                                  return (
                                    <div
                                      key={f.path}
                                      draggable={true}
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData("text/plain", tokenText);
                                        e.dataTransfer.effectAllowed = "copy";
                                      }}
                                      onClick={() => {
                                        navigator.clipboard.writeText(tokenText);
                                        setCopiedField(tokenText);
                                        setTimeout(() => setCopiedField(null), 1800);
                                        message.success(`Copied ${tokenText}`);
                                      }}
                                      title={`Drag into any text field, or click to copy. Sample: ${f.sample}`}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        padding: "3px 8px",
                                        borderRadius: "6px",
                                        background: isCopied ? "#059669" : "#ffffff",
                                        border: isCopied ? "1px solid #10b981" : "1px solid #cbd5e1",
                                        cursor: "grab",
                                        fontSize: "10.5px",
                                        color: isCopied ? "#ffffff" : "#0f766e",
                                        userSelect: "none",
                                        transition: "all 0.15s ease",
                                      }}
                                    >
                                      {isCopied ? <Check size={11} /> : <Copy size={11} />}
                                      <span style={{ fontWeight: 600 }}>{f.path}</span>
                                      <span style={{ opacity: 0.7, fontSize: "9.5px", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        ={f.sample}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const currentMappings = (selectedNode.data.mappings as any[]) || [];
                                          const cleanVar = f.path.replace(/[^a-zA-Z0-9_]/g, "_");
                                          if (!currentMappings.some((m) => m.from === f.path)) {
                                            onUpdateNodeData(selectedNode.id, {
                                              mappings: [...currentMappings, { from: f.path, to: cleanVar }],
                                            });
                                            message.success(`Mapped ${f.path} to {{${cleanVar}}}`);
                                          }
                                        }}
                                        title="Add to Field Mappings"
                                        style={{
                                          marginLeft: "2px",
                                          padding: "0 4px",
                                          borderRadius: "3px",
                                          background: "#f0fdf4",
                                          border: "1px solid #bbf7d0",
                                          color: "#16a34a",
                                          fontSize: "9px",
                                          fontWeight: 700,
                                          cursor: "pointer",
                                        }}
                                      >
                                        +Map
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: "11px", color: "#64748b" }}>
                              Response body is not JSON or has no properties.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Explicit Value Mappings Table */}
                  <div
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      background: "#f9fafb",
                      border: "1px solid #eaecf0",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <label style={{ fontSize: "11.5px", fontWeight: 700, color: "#101828", display: "flex", alignItems: "center", gap: "6px" }}>
                        <Layers size={13} color="#a855f7" /> Field Mappings ({((selectedNode.data.mappings as any[]) || []).length}):
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const currentMappings = (selectedNode.data.mappings as any[]) || [];
                          onUpdateNodeData(selectedNode.id, {
                            mappings: [...currentMappings, { from: "", to: "" }],
                          });
                        }}
                        style={{
                          padding: "3px 8px",
                          borderRadius: "4px",
                          background: "#f3e8ff",
                          border: "1px solid #d8b4fe",
                          color: "#7e22ce",
                          fontSize: "10.5px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Plus size={11} /> Add Mapping
                      </button>
                    </div>

                    {((selectedNode.data.mappings as any[]) || []).length === 0 ? (
                      <div style={{ fontSize: "10.5px", color: "#64748b", fontStyle: "italic" }}>
                        No custom mappings defined. You can also drag & drop response keys directly or reference them like <code>{"{{api_result.key}}"}</code>.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {((selectedNode.data.mappings as any[]) || []).map((m: any, idx: number) => (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              gap: "6px",
                              alignItems: "center",
                            }}
                          >
                            <input
                              type="text"
                              value={m.from || ""}
                              placeholder="Response Path (e.g. status)"
                              onChange={(e) => {
                                const newMappings = [...((selectedNode.data.mappings as any[]) || [])];
                                newMappings[idx] = { ...m, from: e.target.value };
                                onUpdateNodeData(selectedNode.id, { mappings: newMappings });
                              }}
                              style={{
                                flex: 1,
                                padding: "6px 8px",
                                borderRadius: "4px",
                                background: "#ffffff",
                                border: "1px solid #d0d5dd",
                                color: "#101828",
                                fontSize: "11px",
                                outline: "none",
                              }}
                            />
                            <span style={{ fontSize: "11px", color: "#64748b" }}>➔</span>
                            <input
                              type="text"
                              value={m.to || ""}
                              placeholder="Context Var (e.g. order_status)"
                              onChange={(e) => {
                                const newMappings = [...((selectedNode.data.mappings as any[]) || [])];
                                newMappings[idx] = { ...m, to: e.target.value };
                                onUpdateNodeData(selectedNode.id, { mappings: newMappings });
                              }}
                              style={{
                                flex: 1,
                                padding: "6px 8px",
                                borderRadius: "4px",
                                background: "#ffffff",
                                border: "1px solid #d0d5dd",
                                color: "#101828",
                                fontSize: "11px",
                                outline: "none",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newMappings = ((selectedNode.data.mappings as any[]) || []).filter((_, i) => i !== idx);
                                onUpdateNodeData(selectedNode.id, { mappings: newMappings });
                              }}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#ef4444",
                                cursor: "pointer",
                                padding: "2px",
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* API Response Data Usage Guide */}
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      fontSize: "11px",
                      lineHeight: "1.5",
                      color: "#166534",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "#15803d", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Sparkles size={13} /> How to use received API data in later messages:
                    </div>
                    <div>
                      1. Click <strong>⚡ Test Request & Fetch Live Response</strong> above to fetch your real data.
                    </div>
                    <div>
                      2. <strong>Drag & Drop</strong> any green chip directly into your Message text or Button title.
                    </div>
                    <div>
                      3. Or use dot-notation: <code style={{ color: "#0369a1" }}>{`{{${selectedNode.data.save || "api_result"}.fieldName}}`}</code>
                    </div>
                  </div>
                </div>
              )}

              {/* Condition (If / Else) Node Editor */}
              {selectedNode.type === "condition" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div
                    style={{
                      background: "rgba(234, 179, 8, 0.1)",
                      border: "1px solid rgba(234, 179, 8, 0.3)",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#854d0e",
                      lineHeight: "1.4",
                    }}
                  >
                    <strong>🔀 Decision Branching:</strong> Compares the value of a workflow variable. If true, execution continues via the green <strong>True (If)</strong> port; otherwise it takes the red <strong>False (Else)</strong> port.
                  </div>

                  <div>
                    <label style={fieldLabelStyle}>Node Label (Optional):</label>
                    <input
                      type="text"
                      value={selectedNode.data.label || ""}
                      onChange={(e) => onUpdateNodeData(selectedNode.id, { label: e.target.value })}
                      placeholder="e.g. Check VIP Customer or Check Time"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={fieldLabelStyle}>
                      Variable to Evaluate: <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data.variable || ""}
                      onChange={(e) => onUpdateNodeData(selectedNode.id, { variable: e.target.value })}
                      placeholder="e.g. response, selected_row_id, or api_result.status"
                      style={inputStyle}
                    />
                    <span style={{ fontSize: "11px", color: "var(--text-secondary, #71717a)" }}>
                      Variable name without curly braces (e.g. <code>customer_type</code> or <code>response</code>)
                    </span>
                  </div>

                  <div>
                    <label style={fieldLabelStyle}>
                      Comparison Operator: <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <select
                      value={selectedNode.data.operator || "equals"}
                      onChange={(e) => onUpdateNodeData(selectedNode.id, { operator: e.target.value as ConditionOperator })}
                      style={inputStyle}
                    >
                      {CONDITION_OPERATORS.map((op) => (
                        <option key={op} value={op}>
                          {CONDITION_OPERATOR_LABELS[op] || op}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedNode.data.operator !== "is_empty" &&
                    selectedNode.data.operator !== "is_not_empty" &&
                    selectedNode.data.operator !== "exists" && (
                      <div>
                        <label style={fieldLabelStyle}>
                          Value to Compare Against:
                        </label>
                        <input
                          type="text"
                          value={selectedNode.data.value ?? ""}
                          onChange={(e) => onUpdateNodeData(selectedNode.id, { value: e.target.value })}
                          placeholder="e.g. YES, 100, VIP, or {{other_variable}}"
                          style={inputStyle}
                        />
                        <span style={{ fontSize: "11px", color: "var(--text-secondary, #71717a)" }}>
                          Supports static text, numbers, or tokens like <code>{`{{min_price}}`}</code>
                        </span>
                      </div>
                    )}

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      background: "rgba(0,0,0,0.03)",
                      padding: "10px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      border: "1px dashed var(--border, #e4e4e7)",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "var(--text-primary, #18181b)" }}>
                      Routing Ports:
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#10b981" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
                      <strong>True (If)</strong>: Followed when condition succeeds
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#f43f5e" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f43f5e" }} />
                      <strong>False (Else)</strong>: Followed when condition fails
                    </div>
                  </div>
                </div>
              )}

              {/* Go to Flow Node Editor */}
              {selectedNode.type === "goto_flow" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {/* Execution Mode */}
                  <div>
                    <label style={fieldLabelStyle}>Execution Mode:</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "4px" }}>
                      <button
                        type="button"
                        onClick={() => onUpdateNodeData(selectedNode.id, { mode: "handoff" })}
                        style={{
                          padding: "10px 8px",
                          borderRadius: "8px",
                          border: (selectedNode.data.mode || "handoff") === "handoff" ? "2px solid #6366f1" : "1px solid #d0d5dd",
                          background: (selectedNode.data.mode || "handoff") === "handoff" ? "#eef2ff" : "#ffffff",
                          color: (selectedNode.data.mode || "handoff") === "handoff" ? "#4338ca" : "#344054",
                          fontWeight: 600,
                          fontSize: "12px",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "4px",
                          textAlign: "center",
                        }}
                      >
                        <span>Handoff</span>
                        <span style={{ fontSize: "10px", fontWeight: 400, color: "#64748b" }}>
                          End current &amp; switch flow
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onUpdateNodeData(selectedNode.id, { mode: "subflow" })}
                        style={{
                          padding: "10px 8px",
                          borderRadius: "8px",
                          border: selectedNode.data.mode === "subflow" ? "2px solid #6366f1" : "1px solid #d0d5dd",
                          background: selectedNode.data.mode === "subflow" ? "#eef2ff" : "#ffffff",
                          color: selectedNode.data.mode === "subflow" ? "#4338ca" : "#344054",
                          fontWeight: 600,
                          fontSize: "12px",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "4px",
                          textAlign: "center",
                        }}
                      >
                        <span>Sub-flow</span>
                        <span style={{ fontSize: "10px", fontWeight: 400, color: "#64748b" }}>
                          Run target &amp; return here
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Target Workflow Dropdown */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <label style={fieldLabelStyle}>Target Workflow (Published):</label>
                      {isLoadingFlows && <span style={{ fontSize: "10px", color: "#6366f1" }}>Loading...</span>}
                    </div>
                    <select
                      value={selectedNode.data.target_flow_id || ""}
                      onChange={(e) => {
                        const targetId = e.target.value;
                        const matched = availableFlows.find((f) => f.id === targetId);
                        onUpdateNodeData(selectedNode.id, {
                          target_flow_id: targetId,
                          target_flow_name: matched?.name || "",
                          entry_node_id: undefined,
                        });
                      }}
                      style={selectStyle}
                    >
                      <option value="">-- Select a target workflow --</option>
                      {availableFlows.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} {f.version ? `(v${f.version})` : ""} {f.trigger_value ? `• [${f.trigger_value}]` : ""}
                        </option>
                      ))}
                    </select>
                    {availableFlows.length === 0 && !isLoadingFlows && (
                      <p style={{ fontSize: "11px", color: "#d97706", marginTop: "4px" }}>
                        No published workflows found in this project. Only published (active) workflows in the same project can be targeted.
                      </p>
                    )}
                  </div>

                  {/* Optional Entry Node */}
                  <div>
                    <label style={fieldLabelStyle}>Optional Entry Node:</label>
                    {targetFlowNodes.length > 0 ? (
                      <select
                        value={selectedNode.data.entry_node_id || ""}
                        onChange={(e) => onUpdateNodeData(selectedNode.id, { entry_node_id: e.target.value || undefined })}
                        style={selectStyle}
                      >
                        <option value="">Default (Workflow Start / Trigger)</option>
                        {targetFlowNodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.id} ({getNodeTypeName(n.type, n.data)})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={selectedNode.data.entry_node_id || ""}
                        onChange={(e) => onUpdateNodeData(selectedNode.id, { entry_node_id: e.target.value.trim() || undefined })}
                        placeholder="e.g. node_message_123 (defaults to start)"
                        style={inputStyle}
                      />
                    )}
                    <span style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", display: "block" }}>
                      Leave blank to start at the target flow&apos;s default entry step.
                    </span>
                  </div>

                  {/* Informative Mode Box */}
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: (selectedNode.data.mode || "handoff") === "subflow" ? "#f5f3ff" : "#fffbeb",
                      border: `1px solid ${(selectedNode.data.mode || "handoff") === "subflow" ? "#ddd6fe" : "#fef3c7"}`,
                      fontSize: "11px",
                      color: (selectedNode.data.mode || "handoff") === "subflow" ? "#5b21b6" : "#92400e",
                      lineHeight: 1.4,
                    }}
                  >
                    {(selectedNode.data.mode || "handoff") === "subflow" ? (
                      <>
                        <strong>Sub-flow Mode:</strong> Pushes current position onto the call stack (max depth 5). When the target workflow reaches an End Flow step, execution pops and returns to this node&apos;s <strong>Completed</strong> port. If the sub-flow fails, it follows the <strong>Error</strong> port.
                      </>
                    ) : (
                      <>
                        <strong>Handoff Mode:</strong> Terminal exit step for this workflow. Hands off full existing context and transfers the session directly to the target workflow.
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Calculation Node Editor */}
              {selectedNode.type === "calculation" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      fontSize: "12px",
                      color: "#166534",
                      lineHeight: "1.4",
                    }}
                  >
                    <strong>🧮 Compute & Transform:</strong> Perform date differences (e.g. days between check-in and check-out) or math operations (sums, totals, discounts) and save the result into a variable for subsequent steps.
                  </div>

                  <div>
                    <label style={fieldLabelStyle}>Step Label (Optional):</label>
                    <input
                      type="text"
                      value={selectedNode.data.label || ""}
                      onChange={(e) => onUpdateNodeData(selectedNode.id, { label: e.target.value })}
                      placeholder="e.g. Calculate Stay Days or Calculate Total Amount"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={fieldLabelStyle}>
                      Operation Type: <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <select
                      value={selectedNode.data.operation || "add"}
                      onChange={(e) => onUpdateNodeData(selectedNode.id, { operation: e.target.value })}
                      style={inputStyle}
                    >
                      <optgroup label="📅 Date Calculations">
                        <option value="date_diff_days">Difference between 2 Dates in Days (Date B - Date A)</option>
                        <option value="date_diff_hours">Difference between 2 Dates in Hours</option>
                        <option value="date_diff_minutes">Difference between 2 Dates in Minutes</option>
                        <option value="date_add_days">Add N Days to a Date (Date + N)</option>
                      </optgroup>
                      <optgroup label="🔢 Numeric Math Operations">
                        <option value="add">Add (+): Operand A + Operand B</option>
                        <option value="subtract">Subtract (-): Operand A - Operand B</option>
                        <option value="multiply">Multiply (×): Operand A × Operand B</option>
                        <option value="divide">Divide (÷): Operand A ÷ Operand B</option>
                        <option value="percentage">Percentage (%): Operand B % of Operand A</option>
                        <option value="round">Round to Nearest Integer</option>
                        <option value="floor">Floor (Round Down)</option>
                        <option value="ceil">Ceil (Round Up)</option>
                        <option value="formula">Custom Math Formula</option>
                      </optgroup>
                    </select>
                  </div>

                  {selectedNode.data.operation === "formula" ? (
                    <div>
                      <label style={fieldLabelStyle}>
                        Formula Expression: <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={selectedNode.data.formula || ""}
                        onChange={(e) => onUpdateNodeData(selectedNode.id, { formula: e.target.value })}
                        placeholder="e.g. ({{price}} * {{quantity}}) + 15"
                        style={inputStyle}
                      />
                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                        Supports +, -, *, /, (), numbers, and workflow tokens like <code>{"{{price}}"}</code>.
                      </span>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <label style={fieldLabelStyle}>
                            {String(selectedNode.data.operation || "").startsWith("date_diff")
                              ? "Start Date (Date A):"
                              : "First Value (Operand A):"}
                            <span style={{ color: "#ef4444" }}> *</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          value={selectedNode.data.operand_a ?? ""}
                          onChange={(e) => onUpdateNodeData(selectedNode.id, { operand_a: e.target.value })}
                          placeholder={
                            String(selectedNode.data.operation || "").startsWith("date")
                              ? "e.g. {{checkin_date}} or {{$today}}"
                              : "e.g. {{price}} or 100"
                          }
                          style={inputStyle}
                        />
                      </div>

                      {selectedNode.data.operation !== "round" &&
                        selectedNode.data.operation !== "floor" &&
                        selectedNode.data.operation !== "ceil" && (
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <label style={fieldLabelStyle}>
                                {String(selectedNode.data.operation || "").startsWith("date_diff")
                                  ? "End Date (Date B):"
                                  : selectedNode.data.operation === "date_add_days"
                                  ? "Days to Add (Number):"
                                  : selectedNode.data.operation === "percentage"
                                  ? "Percentage Rate (%):"
                                  : "Second Value (Operand B):"}
                                <span style={{ color: "#ef4444" }}> *</span>
                              </label>
                            </div>
                            <input
                              type="text"
                              value={selectedNode.data.operand_b ?? ""}
                              onChange={(e) => onUpdateNodeData(selectedNode.id, { operand_b: e.target.value })}
                              placeholder={
                                String(selectedNode.data.operation || "").startsWith("date_diff")
                                  ? "e.g. {{checkout_date}}"
                                  : selectedNode.data.operation === "date_add_days"
                                  ? "e.g. 3 or {{duration_days}}"
                                  : "e.g. {{tax}} or 5"
                              }
                              style={inputStyle}
                            />
                          </div>
                        )}
                    </>
                  )}

                  {/* Variable helper tokens */}
                  {discoveredWorkflowVars.length > 0 && (
                    <div style={{ background: "#f8fafc", padding: "8px 10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#334155", display: "block", marginBottom: "4px" }}>
                        Click to insert variable into operand:
                      </span>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        {discoveredWorkflowVars.map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              const token = `{{${v}}}`;
                              if (!selectedNode.data.operand_a) {
                                onUpdateNodeData(selectedNode.id, { operand_a: token });
                              } else {
                                onUpdateNodeData(selectedNode.id, { operand_b: token });
                              }
                            }}
                            style={{
                              padding: "2px 7px",
                              borderRadius: "12px",
                              background: "#ffffff",
                              border: "1px solid #cbd5e1",
                              color: "#0f172a",
                              fontSize: "10.5px",
                              fontFamily: "ui-monospace, monospace",
                              cursor: "pointer",
                            }}
                            title={`Click to set operand`}
                          >
                            + {`{{${v}}}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label style={fieldLabelStyle}>
                      Save Result to Variable: <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data.save_to || ""}
                      onChange={(e) => onUpdateNodeData(selectedNode.id, { save_to: e.target.value })}
                      placeholder="e.g. stay_days, total_amount, discount_val"
                      style={inputStyle}
                    />
                    <span style={{ fontSize: "11px", color: "#64748b" }}>
                      Result can be accessed in subsequent steps like <code>{`{{${selectedNode.data.save_to || "calc_result"}}}`}</code>.
                    </span>
                  </div>

                  <div>
                    <label style={fieldLabelStyle}>Round Decimals (Optional):</label>
                    <input
                      type="number"
                      min={0}
                      max={6}
                      value={selectedNode.data.round_decimals ?? ""}
                      onChange={(e) =>
                        onUpdateNodeData(selectedNode.id, {
                          round_decimals: e.target.value !== "" ? parseInt(e.target.value, 10) : undefined,
                        })
                      }
                      placeholder="e.g. 0 for whole numbers / days, 2 for currency"
                      style={inputStyle}
                    />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "#f0fdf4",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      fontSize: "11.5px",
                      border: "1px solid #bbf7d0",
                      color: "#166534",
                    }}
                  >
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#16a34a" }} />
                    <strong>Output Port:</strong> <code>next</code> (Executes calculation and transitions forward immediately).
                  </div>
                </div>
              )}

              {/* End Node Editor */}
              {selectedNode.type === "end" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <label style={fieldLabelStyle}>
                    Closing Message (Optional):
                  </label>
                  <textarea
                    rows={3}
                    value={selectedNode.data.text || ""}
                    onChange={(e) => onUpdateNodeData(selectedNode.id, { text: e.target.value })}
                    placeholder="Thank you for contacting us! Have a wonderful day."
                    style={textareaStyle}
                  />
                </div>
              )}

              {/* Bottom Delete Step Action */}
              <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #eaecf0" }}>
                <button
                  type="button"
                  disabled={selectedNode.type === "trigger"}
                  onClick={() => {
                    if (selectedNode.type === "trigger") {
                      message.warning("The Trigger node cannot be deleted.");
                      return;
                    }
                    onDeleteNode(selectedNode.id);
                  }}
                  style={{
                    width: "100%",
                    minHeight: "44px",
                    padding: "10px 16px",
                    borderRadius: "8px",
                    border: "1px solid #fda29b",
                    background: "#ffffff",
                    color: selectedNode.type === "trigger" ? "#98a2b3" : "#b42318",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: selectedNode.type === "trigger" ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "all 0.15s ease",
                    outline: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedNode.type !== "trigger") {
                      e.currentTarget.style.background = "#fef3f2";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedNode.type !== "trigger") {
                      e.currentTarget.style.background = "#ffffff";
                    }
                  }}
                >
                  <Trash2 size={15} />
                  <span>Delete step</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Test Flow Simulator (Hidden when SHOW_LIVE_PREVIEW = false) */}
      {SHOW_LIVE_PREVIEW && activeTab === "test" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Controls bar */}
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border, #eaecf0)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#f8fafc",
            }}
          >
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#10b981", display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
              Agent Simulator Active
            </div>
            <button
              onClick={startSimulator}
              style={{
                padding: "4px 8px",
                borderRadius: "4px",
                border: "1px solid #d0d5dd",
                background: "#ffffff",
                color: "#344054",
                fontSize: "11px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <RotateCcw size={12} /> Restart Agent
            </button>
          </div>

          {/* Chat phone view */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              background: "#efeae2",
            }}
          >
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                style={{
                  alignSelf: msg.sender === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                }}
              >
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    background: msg.sender === "user" ? "#d9fdd3" : "#ffffff",
                    color: "#111b21",
                    fontSize: "12px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {msg.text}
                </div>

                {/* Quick reply buttons (disappear once an option is selected) */}
                {msg.buttons && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                    {msg.buttons.map((b: any) => {
                      const isCancel = /cancel|reject|abort|no/i.test(b.title) || /cancel/i.test(b.id);
                      return (
                        <button
                          key={b.id}
                          onClick={() => handleSimUserReply(b.title, b.id, i)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "6px",
                            background: isCancel ? "#fef2f2" : "#00a884",
                            color: isCancel ? "#dc2626" : "#ffffff",
                            border: isCancel ? "1px solid #fecaca" : "none",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                            textAlign: "center",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {isCancel ? "✕ " : "✓ "}{b.title}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* List rows (disappear once an option is selected) */}
                {msg.list && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                    {msg.list.map((r: any) => (
                      <button
                        key={r.id}
                        onClick={() => handleSimUserReply(r.title, r.id, i)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "6px",
                          background: "#ffffff",
                          color: "#0f766e",
                          border: "1px solid #cbd5e1",
                          fontSize: "11px",
                          fontWeight: 500,
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div>{r.title}</div>
                        {r.description && <div style={{ fontSize: "10px", color: "#64748b" }}>{r.description}</div>}
                      </button>
                    ))}
                  </div>
                )}

                {/* Inline Calendar Component */}
                {msg.isCalendar && (
                  <div style={{ marginTop: "6px" }}>
                    <CalendarPicker
                      inline
                      onSelect={(_, formattedDate) => {
                        handleSimUserReply(formattedDate, "selected_date", i);
                      }}
                    />
                  </div>
                )}

                {/* Inline Time Component */}
                {msg.isTime && (
                  <div style={{ marginTop: "6px" }}>
                    <TimePicker
                      inline
                      onSelect={(timeStr) => {
                        handleSimUserReply(timeStr, "selected_time", i);
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Popover / Drawer for Calendar or Time picker */}
          {simPickerMode === "calendar" && (
            <div style={{ padding: "8px 12px", background: "#f8fafc", borderTop: "1px solid #eaecf0", display: "flex", justifyContent: "center" }}>
              <CalendarPicker
                onSelect={(_, formattedDate) => {
                  handleSimUserReply(formattedDate, "selected_date");
                  setSimPickerMode(null);
                }}
                onClose={() => setSimPickerMode(null)}
              />
            </div>
          )}

          {simPickerMode === "time" && (
            <div style={{ padding: "8px 12px", background: "#f8fafc", borderTop: "1px solid #eaecf0", display: "flex", justifyContent: "center" }}>
              <TimePicker
                onSelect={(timeStr) => {
                  handleSimUserReply(timeStr, "selected_time");
                  setSimPickerMode(null);
                }}
                onClose={() => setSimPickerMode(null)}
              />
            </div>
          )}

          {/* User reply input */}
          <div
            style={{
              padding: "10px",
              borderTop: "1px solid var(--border, #eaecf0)",
              display: "flex",
              gap: "6px",
              background: "#ffffff",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={() => setSimPickerMode((prev) => (prev === "calendar" ? null : "calendar"))}
              title="Pick date with Calendar"
              style={{
                padding: "7px 9px",
                borderRadius: "6px",
                border: simPickerMode === "calendar" ? "1.5px solid #0f766e" : "1px solid #d0d5dd",
                background: simPickerMode === "calendar" ? "#f0fdf4" : "#ffffff",
                color: simPickerMode === "calendar" ? "#0f766e" : "#475467",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Calendar size={14} />
            </button>

            <button
              type="button"
              onClick={() => setSimPickerMode((prev) => (prev === "time" ? null : "time"))}
              title="Pick time with Time Picker"
              style={{
                padding: "7px 9px",
                borderRadius: "6px",
                border: simPickerMode === "time" ? "1.5px solid #0284c7" : "1px solid #d0d5dd",
                background: simPickerMode === "time" ? "#f0f9ff" : "#ffffff",
                color: simPickerMode === "time" ? "#0284c7" : "#475467",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Clock size={14} />
            </button>

            <input
              type="text"
              placeholder={simWaitingKind ? `Reply (${simWaitingKind})...` : "Type message to test agent..."}
              value={simUserInput}
              onChange={(e) => setSimUserInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSimUserReply(simUserInput);
              }}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "6px",
                background: "#ffffff",
                border: "1px solid #d0d5dd",
                color: "#101828",
                fontSize: "12px",
                outline: "none",
              }}
            />
            <button
              onClick={() => handleSimUserReply(simUserInput)}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                background: "#0f9d7a",
                color: "#ffffff",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Send size={14} />
            </button>
          </div>

          {/* Context variables preview */}
          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid var(--border, #eaecf0)",
              background: "#f8fafc",
              maxHeight: "130px",
              overflowY: "auto",
            }}
          >
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#475467", marginBottom: "4px" }}>
              Active Context Variables:
            </div>
            <pre style={{ margin: 0, fontSize: "10px", color: "#0f766e", fontFamily: "monospace" }}>
              {JSON.stringify(simContext, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Webhook Allowlist Modal */}
      <AddAllowlistModal
        open={allowlistModalOpen}
        onClose={() => setAllowlistModalOpen(false)}
        initialHost={allowlistInitialHost}
        onSuccess={(addedHost) => {
          handleTestApi();
        }}
      />
    </div>
  );
}
