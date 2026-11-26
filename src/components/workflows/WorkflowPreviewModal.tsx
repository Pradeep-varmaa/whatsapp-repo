"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  WorkflowGraph,
  WorkflowNode,
  ConditionOperator,
} from "@/server/workflows/types";
import { parseAndNormalizeDate } from "@/server/workflows/dateUtils";
import {
  interpolateString,
  resolveVariable,
  resolveValue,
} from "@/server/workflows/variableInterpolator";
import { CalendarPicker } from "./CalendarPicker";
import { TimePicker } from "./TimePicker";
import {
  Bot,
  RotateCcw,
  Send,
  Calendar,
  Clock,
  Sparkles,
  Check,
  Code,
  X,
  ChevronRight,
  Info,
} from "lucide-react";
import { Modal, Spin, message } from "antd";

interface WorkflowPreviewModalProps {
  workflowId: string | null;
  workflowName?: string;
  open: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  sender: "bot" | "user" | "system";
  text: string;
  buttons?: Array<{ id: string; title: string }>;
  list?: Array<{ id: string; title: string; description?: string }>;
  isCalendar?: boolean;
  isTime?: boolean;
  time?: string;
}

export function WorkflowPreviewModal({
  workflowId,
  workflowName,
  open,
  onClose,
}: WorkflowPreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [graph, setGraph] = useState<WorkflowGraph | null>(null);
  const [currentWorkflowName, setCurrentWorkflowName] = useState(workflowName || "Agent");

  // Simulator execution state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [simContext, setSimContext] = useState<Record<string, any>>({
    customer_phone: "+919014683627",
    phone: "+919014683627",
    mobile: "+919014683627",
    clean_phone: "919014683627",
  });
  const [simCurrentNodeId, setSimCurrentNodeId] = useState<string | null>(null);
  const [simUserInput, setSimUserInput] = useState("");
  const [simWaitingKind, setSimWaitingKind] = useState<string | null>(null);
  const [simWaitingVar, setSimWaitingVar] = useState<string | null>(null);
  const [simPickerMode, setSimPickerMode] = useState<"calendar" | "time" | null>(null);
  const [showVariables, setShowVariables] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, simPickerMode]);

  // Fetch workflow graph when modal opens
  useEffect(() => {
    if (!open || !workflowId) return;

    let isMounted = true;
    setLoading(true);

    const loadWorkflow = async () => {
      try {
        const res = await fetch(`/api/workflows/${workflowId}`);
        const json = await res.json();
        if (isMounted && json.success && json.data) {
          const loadedGraph: WorkflowGraph = json.data.graph;
          setGraph(loadedGraph);
          setCurrentWorkflowName(json.data.name || workflowName || "Agent");
          startExecution(loadedGraph);
        } else if (isMounted) {
          message.error(json.error?.message || "Failed to load workflow for preview.");
        }
      } catch (err: any) {
        if (isMounted) {
          message.error(err.message || "Failed to load workflow.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadWorkflow();

    return () => {
      isMounted = false;
    };
  }, [open, workflowId]);

  const getTimeString = () => {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Start executing the workflow from the trigger node
  const startExecution = (activeGraph: WorkflowGraph) => {
    const trigger = activeGraph.nodes.find((n) => n.type === "trigger");
    const initialContext: Record<string, any> = {
      customer_phone: "+919014683627",
      phone: "+919014683627",
      mobile: "+919014683627",
      clean_phone: "919014683627",
    };
    setSimContext(initialContext);
    setChatMessages([]);
    setSimWaitingKind(null);
    setSimWaitingVar(null);
    setSimPickerMode(null);

    if (!trigger) {
      setChatMessages([
        {
          id: `msg_${Date.now()}`,
          sender: "system",
          text: "⚠️ No Trigger node found in this workflow.",
          time: getTimeString(),
        },
      ]);
      return;
    }

    // First simulated inbound message from customer matching trigger
    const triggerKeyword = (trigger.data?.keyword || "Hi").split(",")[0].trim();
    const initialMessages: ChatMessage[] = [
      {
        id: `msg_user_${Date.now()}`,
        sender: "user",
        text: triggerKeyword,
        time: getTimeString(),
      },
    ];
    setChatMessages(initialMessages);

    // Follow trigger's next port
    const firstEdge = activeGraph.edges.find((e) => e.from === trigger.id && e.port === "next");
    if (!firstEdge) {
      setTimeout(() => {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `msg_bot_${Date.now()}`,
            sender: "system",
            text: "⚡ Trigger matched. No next step is connected in the workflow.",
            time: getTimeString(),
          },
        ]);
      }, 300);
      return;
    }

    setTimeout(() => {
      void stepExecution(firstEdge.to, initialContext, activeGraph);
    }, 400);
  };

  // Execute a single step in the workflow graph
  const stepExecution = async (
    nodeId: string,
    context: Record<string, any>,
    activeGraph: WorkflowGraph
  ) => {
    const node = activeGraph.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    setSimCurrentNodeId(node.id);

    if (node.type === "message") {
      const text = interpolateString(node.data?.text || "", context);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_${Math.random()}`,
          sender: "bot",
          text,
          time: getTimeString(),
        },
      ]);

      const nextEdge = activeGraph.edges.find((e) => e.from === node.id && e.port === "next");
      if (nextEdge) {
        setTimeout(() => {
          void stepExecution(nextEdge.to, context, activeGraph);
        }, 500);
      }
    } else if (node.type === "buttons") {
      const text = interpolateString(node.data?.text || "", context);
      const opts = (node.data?.opts || []).map((o: any) => ({
        id: o.id,
        title: interpolateString(o.title || "", context),
      }));

      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_${Math.random()}`,
          sender: "bot",
          text,
          buttons: opts,
          time: getTimeString(),
        },
      ]);
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
          const fallbackText = interpolateString(
            node.data?.empty_fallback_text ||
              node.data?.empty_message ||
              node.data?.text ||
              "No options are currently available.",
            context
          );
          setChatMessages((prev) => [
            ...prev,
            {
              id: `msg_${Date.now()}_${Math.random()}`,
              sender: "bot",
              text: fallbackText,
              time: getTimeString(),
            },
          ]);
          const emptyEdge = activeGraph.edges.find(
            (e) =>
              e.from === node.id &&
              (e.port === "empty" || e.port === "next" || e.port === "default")
          );
          if (emptyEdge) {
            setTimeout(() => {
              void stepExecution(emptyEdge.to, context, activeGraph);
            }, 400);
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
                return typeof item[trimmed] === "object"
                  ? JSON.stringify(item[trimmed])
                  : String(item[trimmed]);
              }
            }
            return resolveVariable(trimmed, itemContext);
          };

          const rawTitle =
            resolveField(node.data?.title_field) ||
            String(
              item?.title ??
                item?.name ??
                item?.product_name ??
                item?.label ??
                `Option ${idx + 1}`
            );
          const rawDesc =
            resolveField(node.data?.description_field) ||
            (item?.description ? String(item.description) : undefined);
          const rawId =
            resolveField(node.data?.id_field) ||
            String(item?.id ?? item?._id ?? item?.key ?? `opt_${idx + 1}`);

          let finalId = rawId || `row_${idx + 1}`;
          if (seenIds.has(finalId)) finalId = `${finalId}_${idx + 1}`;
          seenIds.add(finalId);

          return {
            id: finalId,
            title: (rawTitle || `Option ${idx + 1}`).slice(0, 24),
            description: rawDesc ? rawDesc.slice(0, 72) : undefined,
          };
        });

        setChatMessages((prev) => [
          ...prev,
          {
            id: `msg_${Date.now()}_${Math.random()}`,
            sender: "bot",
            text,
            list: mappedOpts,
            time: getTimeString(),
          },
        ]);
        setSimWaitingKind("list");
      } else {
        const seenIds = new Set<string>();
        const mappedOpts = (node.data?.opts || []).slice(0, 10).map((o: any, idx: number) => {
          const rawTitle = interpolateString(o.title || "", context) || `Option ${idx + 1}`;
          const rawDesc = o.description ? interpolateString(o.description, context) : undefined;
          let finalId = o.id || `opt_${idx + 1}`;
          if (seenIds.has(finalId)) finalId = `${finalId}_${idx + 1}`;
          seenIds.add(finalId);

          return {
            id: finalId,
            title: rawTitle.slice(0, 24),
            description: rawDesc ? rawDesc.slice(0, 72) : undefined,
          };
        });

        setChatMessages((prev) => [
          ...prev,
          {
            id: `msg_${Date.now()}_${Math.random()}`,
            sender: "bot",
            text,
            list: mappedOpts,
            time: getTimeString(),
          },
        ]);
        setSimWaitingKind("list");
      }
    } else if (node.type === "ask") {
      const text = interpolateString(node.data?.text || "", context);
      const kind = node.data?.kind || "text";

      let interactiveList: any[] | undefined;
      if (kind === "date") {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const weekdayFmt = new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        interactiveList = [
          { id: "opt_today", title: `Today (${weekdayFmt.format(now)})`, description: "Available today" },
          {
            id: "opt_tomorrow",
            title: `Tomorrow (${weekdayFmt.format(new Date(now.getTime() + 24 * 3600 * 1000))})`,
            description: "Next day",
          },
        ];
        for (let i = 2; i <= 4; i++) {
          const nextDay = new Date(now.getTime() + i * 24 * 3600 * 1000);
          const iso = `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}`;
          interactiveList.push({
            id: `opt_date_${iso}`,
            title: weekdayFmt.format(nextDay),
            description: `Date: ${iso}`,
          });
        }
        interactiveList.push({ id: "opt_custom_date", title: "📅 Custom Date", description: "Select from calendar" });
      } else if (kind === "time") {
        interactiveList = [
          { id: "slot_10am", title: "10:00 AM - 11:00 AM", description: "Morning slot" },
          { id: "slot_11am", title: "11:00 AM - 12:00 PM", description: "Morning slot" },
          { id: "slot_02pm", title: "02:00 PM - 03:00 PM", description: "Afternoon slot" },
          { id: "slot_03pm", title: "03:00 PM - 04:00 PM", description: "Afternoon slot" },
          { id: "slot_05pm", title: "05:00 PM - 06:00 PM", description: "Evening slot" },
          { id: "slot_custom", title: "⏰ Custom Time", description: "Pick custom time" },
        ];
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_${Math.random()}`,
          sender: "bot",
          text,
          list: interactiveList,
          isCalendar: kind === "date",
          isTime: kind === "time",
          time: getTimeString(),
        },
      ]);
      setSimWaitingKind(kind);
      setSimWaitingVar(node.data?.var || "response");
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
          id: `msg_sys_${Date.now()}`,
          sender: "system",
          text: `🔀 Condition [${variable} ${operator} "${strTarget}"]: ${
            isMatch ? "✓ True (Yes branch)" : "✕ False (No branch)"
          }`,
          time: getTimeString(),
        },
      ]);

      const targetPort = isMatch ? "true" : "false";
      const branchEdge = activeGraph.edges.find((e) => e.from === node.id && e.port === targetPort);
      if (branchEdge) {
        setTimeout(() => {
          void stepExecution(branchEdge.to, context, activeGraph);
        }, 400);
      }
    } else if (node.type === "api") {
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
            const resData =
              json.data.json !== null && json.data.json !== undefined
                ? json.data.json
                : json.data.rawText;
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
            const errMsg = json.error?.message || "API request returned an error";
            setChatMessages((prev) => [
              ...prev,
              {
                id: `msg_api_err_${Date.now()}`,
                sender: "system",
                text: `⚠️ API Error: ${errMsg}`,
                time: getTimeString(),
              },
            ]);
          }
        } catch (fetchErr: any) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: `msg_api_net_${Date.now()}`,
              sender: "system",
              text: `⚠️ API Network Error: ${fetchErr.message || "Failed to reach endpoint"}`,
              time: getTimeString(),
            },
          ]);
        }
      }

      if (apiSucceeded) {
        const successEdge = activeGraph.edges.find(
          (e) => e.from === node.id && (e.port === "success" || e.port === "next")
        );
        if (successEdge) {
          setTimeout(() => {
            void stepExecution(successEdge.to, nextContext, activeGraph);
          }, 350);
        }
      } else {
        const errorEdge = activeGraph.edges.find((e) => e.from === node.id && e.port === "error");
        if (errorEdge) {
          setTimeout(() => {
            void stepExecution(errorEdge.to, nextContext, activeGraph);
          }, 350);
        }
      }
    } else if (node.type === "end") {
      const text = interpolateString(node.data?.text || "Workflow finished.", context);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg_end_${Date.now()}`,
          sender: "bot",
          text: `🏁 ${text}`,
          time: getTimeString(),
        },
      ]);
      setSimWaitingKind(null);
    }
  };

  // Handle user interacting with chat (typing reply or clicking button/list/date)
  const handleUserReply = (replyText: string, portId?: string, msgId?: string) => {
    if (!replyText.trim() || !graph) return;

    // Remove buttons/list from active prompt once answered
    setChatMessages((prev) => {
      const updated = prev.map((msg) => {
        if (msgId ? msg.id === msgId : (msg.buttons || msg.list || msg.isCalendar || msg.isTime)) {
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
      return [
        ...updated,
        {
          id: `msg_user_${Date.now()}`,
          sender: "user",
          text: replyText.trim(),
          time: getTimeString(),
        },
      ];
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
            {
              id: `msg_val_err_${Date.now()}`,
              sender: "bot",
              text: "⚠️ Please enter a valid date (e.g. 25/11/2026 or YYYY-MM-DD).",
              time: getTimeString(),
            },
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
        setTimeout(() => {
          void stepExecution(nextEdge.to, nextContext, graph);
        }, 400);
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

      if (currentNode.data?.is_dynamic && currentNode.data?.array_path) {
        const rawArr = resolveValue(currentNode.data.array_path, nextContext);
        let arrToSearch: any[] = [];
        if (Array.isArray(rawArr)) arrToSearch = rawArr;
        else if (rawArr && typeof rawArr === "object") {
          const found = Object.values(rawArr).find(Array.isArray);
          if (found) arrToSearch = found as any[];
        }
        if (arrToSearch.length > 0) {
          const matchedItem = arrToSearch.find((item: any, idx: number) => {
            const itemId = String(item?.id ?? item?._id ?? item?.key ?? `opt_${idx + 1}`);
            const itemTitle = String(
              item?.title ?? item?.name ?? item?.product_name ?? item?.label ?? ""
            );
            return itemId === selectedId || itemTitle === selectedTitle;
          });
          if (matchedItem) {
            nextContext["selected_row"] = matchedItem;
          }
        }
      }

      setSimContext(nextContext);

      // Check special custom date trigger
      if (selectedId === "opt_custom_date") {
        setSimPickerMode("calendar");
        return;
      }
      if (selectedId === "slot_custom") {
        setSimPickerMode("time");
        return;
      }

      // Find matching edge by port
      const edge =
        graph.edges.find((e) => e.from === currentNode.id && e.port === selectedId) ||
        graph.edges.find(
          (e) => e.from === currentNode.id && e.port.toLowerCase() === selectedId.toLowerCase()
        ) ||
        graph.edges.find(
          (e) =>
            e.from === currentNode.id &&
            (e.port === "next" || e.port === "default" || e.port === "selected")
        );

      if (edge) {
        setTimeout(() => {
          void stepExecution(edge.to, nextContext, graph);
        }, 400);
      }
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={440}
      centered
      destroyOnClose
      styles={{
        body: {
          padding: 0,
          borderRadius: "16px",
          overflow: "hidden",
          background: "#0b141a",
        },
      }}
    >
      {/* WhatsApp Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "#202c33",
          borderBottom: "1px solid #2a3942",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "#00a884",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              flexShrink: 0,
            }}
          >
            <Bot size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "#e9edef",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "200px",
              }}
            >
              {currentWorkflowName}
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "#00a884",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#00a884",
                  display: "inline-block",
                }}
              />
              Live Agent Execution
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={() => setShowVariables((prev) => !prev)}
            title="Inspect context variables"
            style={{
              padding: "5px 8px",
              borderRadius: "6px",
              border: "1px solid #3b4a54",
              background: showVariables ? "#00a884" : "rgba(255,255,255,0.08)",
              color: showVariables ? "#ffffff" : "#aebac1",
              fontSize: "11px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <Code size={13} />
            <span>Vars</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (graph) startExecution(graph);
            }}
            title="Restart flow from beginning"
            style={{
              padding: "5px 8px",
              borderRadius: "6px",
              border: "1px solid #3b4a54",
              background: "rgba(255,255,255,0.08)",
              color: "#aebac1",
              fontSize: "11px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <RotateCcw size={13} />
            <span>Restart</span>
          </button>
        </div>
      </div>

      {/* Variables Drawer Preview */}
      {showVariables && (
        <div
          style={{
            padding: "8px 14px",
            background: "#111b21",
            borderBottom: "1px solid #2a3942",
            maxHeight: "110px",
            overflowY: "auto",
            fontSize: "10.5px",
          }}
        >
          <div style={{ color: "#00a884", fontWeight: 700, marginBottom: "4px" }}>
            Active Context Variables:
          </div>
          <pre
            style={{
              margin: 0,
              color: "#8696a0",
              fontFamily: "ui-monospace, monospace",
              fontSize: "10px",
            }}
          >
            {JSON.stringify(simContext, null, 2)}
          </pre>
        </div>
      )}

      {/* WhatsApp Chat Body */}
      <div
        ref={chatContainerRef}
        style={{
          height: "380px",
          overflowY: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          background: "#0b141a",
          backgroundImage:
            "radial-gradient(#182229 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        {loading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "12px",
              color: "#8696a0",
            }}
          >
            <Spin />
            <span style={{ fontSize: "12px" }}>Loading workflow graph...</span>
          </div>
        ) : (
          chatMessages.map((msg) => (
            <div
              key={msg.id}
              style={{
                alignSelf:
                  msg.sender === "user"
                    ? "flex-end"
                    : msg.sender === "system"
                    ? "center"
                    : "flex-start",
                maxWidth: msg.sender === "system" ? "95%" : "82%",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              {msg.sender === "system" ? (
                <div
                  style={{
                    padding: "4px 10px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.08)",
                    color: "#8696a0",
                    fontSize: "11px",
                    textAlign: "center",
                    border: "1px dashed rgba(255, 255, 255, 0.15)",
                  }}
                >
                  {msg.text}
                </div>
              ) : (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius:
                      msg.sender === "user"
                        ? "10px 0px 10px 10px"
                        : "0px 10px 10px 10px",
                    background: msg.sender === "user" ? "#005c4b" : "#202c33",
                    color: "#e9edef",
                    fontSize: "13px",
                    lineHeight: "1.45",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                    wordBreak: "break-word",
                  }}
                >
                  <div>{msg.text}</div>
                  {msg.time && (
                    <div
                      style={{
                        fontSize: "9.5px",
                        color: msg.sender === "user" ? "#8696a0" : "#8696a0",
                        textAlign: "right",
                        marginTop: "2px",
                      }}
                    >
                      {msg.time}
                    </div>
                  )}
                </div>
              )}

              {/* Quick Reply Buttons */}
              {msg.buttons && msg.buttons.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                  {msg.buttons.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleUserReply(b.title, b.id, msg.id)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "8px",
                        background: "#202c33",
                        border: "1px solid #00a884",
                        color: "#00a884",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#00a884";
                        e.currentTarget.style.color = "#ffffff";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#202c33";
                        e.currentTarget.style.color = "#00a884";
                      }}
                    >
                      <span>{b.title}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Interactive List Rows */}
              {msg.list && msg.list.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    marginTop: "4px",
                    maxHeight: "160px",
                    overflowY: "auto",
                  }}
                >
                  {msg.list.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleUserReply(r.title, r.id, msg.id)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "8px",
                        background: "#202c33",
                        border: "1px solid #2a3942",
                        color: "#e9edef",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: "pointer",
                        textAlign: "left",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "#00a884";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#2a3942";
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: "#00a884" }}>{r.title}</div>
                        {r.description && (
                          <div style={{ fontSize: "10.5px", color: "#8696a0", marginTop: "2px" }}>
                            {r.description}
                          </div>
                        )}
                      </div>
                      <ChevronRight size={14} color="#8696a0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Inline Calendar Picker Popover */}
      {simPickerMode === "calendar" && (
        <div
          style={{
            padding: "10px",
            background: "#202c33",
            borderTop: "1px solid #2a3942",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <CalendarPicker
            inline
            onSelect={(_, formattedDate) => {
              handleUserReply(formattedDate, "selected_date");
              setSimPickerMode(null);
            }}
          />
        </div>
      )}

      {/* Inline Time Picker Popover */}
      {simPickerMode === "time" && (
        <div
          style={{
            padding: "10px",
            background: "#202c33",
            borderTop: "1px solid #2a3942",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <TimePicker
            inline
            onSelect={(timeStr) => {
              handleUserReply(timeStr, "selected_time");
              setSimPickerMode(null);
            }}
          />
        </div>
      )}

      {/* WhatsApp Input Footer */}
      <div
        style={{
          padding: "10px 12px",
          background: "#202c33",
          borderTop: "1px solid #2a3942",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <button
          type="button"
          onClick={() => setSimPickerMode((prev) => (prev === "calendar" ? null : "calendar"))}
          title="Pick date with calendar"
          style={{
            padding: "7px 8px",
            borderRadius: "6px",
            border: "none",
            background: simPickerMode === "calendar" ? "#00a884" : "transparent",
            color: simPickerMode === "calendar" ? "#ffffff" : "#8696a0",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Calendar size={16} />
        </button>

        <button
          type="button"
          onClick={() => setSimPickerMode((prev) => (prev === "time" ? null : "time"))}
          title="Pick time slot"
          style={{
            padding: "7px 8px",
            borderRadius: "6px",
            border: "none",
            background: simPickerMode === "time" ? "#00a884" : "transparent",
            color: simPickerMode === "time" ? "#ffffff" : "#8696a0",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Clock size={16} />
        </button>

        <input
          type="text"
          placeholder={
            simWaitingKind ? `Reply (${simWaitingKind})...` : "Type a message..."
          }
          value={simUserInput}
          onChange={(e) => setSimUserInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && simUserInput.trim()) {
              handleUserReply(simUserInput);
            }
          }}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: "8px",
            background: "#2a3942",
            border: "none",
            color: "#e9edef",
            fontSize: "13px",
            outline: "none",
          }}
        />

        <button
          type="button"
          onClick={() => {
            if (simUserInput.trim()) {
              handleUserReply(simUserInput);
            }
          }}
          disabled={!simUserInput.trim()}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: simUserInput.trim() ? "#00a884" : "#2a3942",
            color: simUserInput.trim() ? "#ffffff" : "#8696a0",
            border: "none",
            cursor: simUserInput.trim() ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s ease",
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </Modal>
  );
}
