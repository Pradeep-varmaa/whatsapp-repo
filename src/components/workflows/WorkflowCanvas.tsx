"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Controls,
  Background,
  MiniMap,
  Connection,
  Edge,
  Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MessageSquare, Radio, List, HelpCircle, Globe, Flag, Calendar, Clock, Copy, ClipboardPaste, GitBranch } from "lucide-react";

import { nodeTypes } from "./nodes";
import { InspectorPanel } from "./InspectorPanel";
import { WorkflowHeader } from "./WorkflowHeader";
import { NodeType, WorkflowGraph } from "@/server/workflows/types";
import { message } from "antd";

const CONTEXT_MENU_ITEMS: {
  type: NodeType;
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  customData?: Record<string, any>;
}[] = [
  {
    type: "message",
    label: "Message",
    icon: <MessageSquare size={14} />,
    color: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.15)",
  },
  {
    type: "buttons",
    label: "Quick Buttons",
    icon: <Radio size={14} />,
    color: "#a855f7",
    bg: "rgba(168, 85, 247, 0.15)",
  },
  {
    type: "list",
    label: "Menu List",
    icon: <List size={14} />,
    color: "#0ea5e9",
    bg: "rgba(14, 165, 233, 0.15)",
  },
  {
    type: "ask",
    label: "Date Picker",
    icon: <Calendar size={14} />,
    color: "#0f766e",
    bg: "rgba(15, 118, 110, 0.15)",
    customData: {
      text: "Please select your appointment date:",
      var: "selected_date",
      kind: "date",
    },
  },
  {
    type: "ask",
    label: "Time Picker",
    icon: <Clock size={14} />,
    color: "#0284c7",
    bg: "rgba(2, 132, 199, 0.15)",
    customData: {
      text: "Please select your preferred time slot:",
      var: "selected_time",
      kind: "time",
    },
  },
  {
    type: "ask",
    label: "Ask Question",
    icon: <HelpCircle size={14} />,
    color: "#f97316",
    bg: "rgba(249, 115, 22, 0.15)",
  },
  {
    type: "api",
    label: "Server API",
    icon: <Globe size={14} />,
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.15)",
  },
  {
    type: "condition",
    label: "Condition (If / Else)",
    icon: <GitBranch size={14} />,
    color: "#eab308",
    bg: "rgba(234, 179, 8, 0.15)",
    customData: {
      variable: "response",
      operator: "equals",
      value: "",
    },
  },
  {
    type: "end",
    label: "End Flow",
    icon: <Flag size={14} />,
    color: "#9ca3af",
    bg: "rgba(156, 163, 175, 0.18)",
  },
];

interface WorkflowCanvasProps {
  workflowId: string;
  initialName: string;
  initialVersion: number;
  initialStatus: "draft" | "active" | "archived";
  initialGraph: WorkflowGraph;
  projectId: string;
  onSave: (graph: WorkflowGraph, name: string) => Promise<void>;
  onPublish: (graph: WorkflowGraph) => Promise<void>;
}

function WorkflowCanvasInternal({
  workflowId,
  initialName,
  initialVersion,
  initialStatus,
  initialGraph,
  projectId,
  onSave,
  onPublish,
}: WorkflowCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState(initialStatus);
  const [version] = useState(initialVersion);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Convert initialGraph to ReactFlow nodes & edges
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    (initialGraph.nodes || []).map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position || { x: 250, y: 100 },
      data: n.data || {},
    }))
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    (initialGraph.edges || []).map((e, idx) => ({
      id: e.id || `e_${e.from}_${e.port}_${e.to}_${idx}`,
      source: e.from,
      sourceHandle: e.port,
      target: e.to,
      animated: true,
      style: { stroke: "#10b981", strokeWidth: 2 },
    }))
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const lastCanvasPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    flowPos: { x: number; y: number };
  } | null>(null);

  // Sync clipboard state from localStorage on mount and window focus
  useEffect(() => {
    const checkClipboard = () => {
      try {
        const stored = localStorage.getItem("wa_workflow_design_clipboard");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
            setHasClipboard(true);
            return;
          }
        }
        setHasClipboard(false);
      } catch {
        setHasClipboard(false);
      }
    };
    checkClipboard();
    window.addEventListener("focus", checkClipboard);
    return () => window.removeEventListener("focus", checkClipboard);
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null);
    window.addEventListener("click", handleCloseMenu);
    return () => window.removeEventListener("click", handleCloseMenu);
  }, []);

  // History stack for Undo / Redo
  const historyRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
  const historyIndexRef = useRef<number>(-1);

  const pushHistory = useCallback(
    (currentNodes: Node[], currentEdges: Edge[]) => {
      const nextIndex = historyIndexRef.current + 1;
      historyRef.current = historyRef.current.slice(0, nextIndex);
      historyRef.current.push({
        nodes: JSON.parse(JSON.stringify(currentNodes)),
        edges: JSON.parse(JSON.stringify(currentEdges)),
      });
      historyIndexRef.current = nextIndex;
    },
    []
  );

  // Connection handler
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const nextEdges = addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: "#10b981", strokeWidth: 2 },
          },
          eds
        );
        pushHistory(nodes, nextEdges);
        return nextEdges;
      });
    },
    [nodes, setEdges, pushHistory]
  );

  // Node Selection
  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
    setContextMenu(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setContextMenu(null);
  }, []);

  // Update Node Data
  const handleUpdateNodeData = useCallback(
    (nodeId: string, newData: Record<string, any>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId) {
            return { ...n, data: { ...n.data, ...newData } };
          }
          return n;
        })
      );
      if (newData.is_dynamic) {
        setEdges((eds) =>
          eds.map((e) => {
            if (e.source === nodeId && (!e.sourceHandle || e.sourceHandle.startsWith("row_") || e.sourceHandle.startsWith("opt_"))) {
              return { ...e, sourceHandle: "next" };
            }
            return e;
          })
        );
      }
    },
    [setNodes, setEdges]
  );

  // Delete Node
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId(null);
    },
    [setNodes, setEdges]
  );

  // Anti-collision helper to avoid placing nodes directly on top of each other
  const adjustAntiCollision = useCallback((pos: { x: number; y: number }, existingNodes: Node[]) => {
    let target = { ...pos };
    let collision = true;
    let attempts = 0;
    while (collision && attempts < 10) {
      collision = existingNodes.some(
        (n) => Math.abs(n.position.x - target.x) < 50 && Math.abs(n.position.y - target.y) < 50
      );
      if (collision) {
        target.x += 40;
        target.y += 40;
        attempts++;
      }
    }
    return target;
  }, []);

  // Calculate intelligent position based on user pointer, selected node, or current visible viewport
  const getSmartPosition = useCallback(
    (preferredPosition?: { x: number; y: number }) => {
      if (preferredPosition) {
        return adjustAntiCollision(preferredPosition, nodes);
      }

      // 1. If a node is selected, place the new node directly below it for clean chaining
      if (selectedNodeId) {
        const selected = nodes.find((n) => n.id === selectedNodeId);
        if (selected) {
          return adjustAntiCollision(
            {
              x: selected.position.x,
              y: selected.position.y + 160,
            },
            nodes
          );
        }
      }

      // 2. If the user pointed or hovered over the canvas recently
      if (lastCanvasPointerRef.current) {
        return adjustAntiCollision(lastCanvasPointerRef.current, nodes);
      }

      // 3. Center of the user's current visible canvas viewport (crucial for long workflows)
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (bounds) {
        const centerScreen = {
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        };
        const flowCenter = screenToFlowPosition(centerScreen);
        return adjustAntiCollision(
          {
            x: Math.round(flowCenter.x - 110),
            y: Math.round(flowCenter.y - 45),
          },
          nodes
        );
      }

      // 4. Fallback below the lowest node
      if (nodes.length > 0) {
        const maxY = Math.max(...nodes.map((n) => n.position.y));
        const lowestNode = nodes.find((n) => n.position.y === maxY);
        return adjustAntiCollision(
          {
            x: lowestNode ? lowestNode.position.x : 250,
            y: maxY + 160,
          },
          nodes
        );
      }

      return { x: 250, y: 150 };
    },
    [adjustAntiCollision, nodes, screenToFlowPosition, selectedNodeId]
  );

  // Add Node from Palette, Context Menu, or Keyboard
  const handleAddNode = useCallback(
    (type: NodeType, position?: { x: number; y: number }, customData?: Record<string, any>) => {
      const finalPosition = position ? adjustAntiCollision(position, nodes) : getSmartPosition();
      const newNodeId = `node_${type}_${Date.now().toString().slice(-4)}`;
      let defaultData: Record<string, any> = {};

      if (type === "message") defaultData = { text: "Hello! How can we help you?" };
      else if (type === "buttons") {
        defaultData = {
          text: "Please select an option:",
          opts: [
            { id: `btn_${Date.now()}_1`, title: "Option 1" },
            { id: `btn_${Date.now()}_2`, title: "Option 2" },
          ],
        };
      } else if (type === "list") {
        defaultData = {
          text: "Select from the list below:",
          buttonText: "Menu Options",
          opts: [
            { id: `row_${Date.now()}_1`, title: "First Option", description: "" },
            { id: `row_${Date.now()}_2`, title: "Second Option", description: "" },
          ],
        };
      } else if (type === "ask") {
        defaultData = { text: "What is your email address?", var: "customer_email", kind: "email" };
      } else if (type === "api") {
        const existingApiCount = nodes.filter((n) => n.type === "api").length;
        const autoSaveVar = existingApiCount === 0 ? "api_result" : `api_result_${existingApiCount + 1}`;
        defaultData = { method: "GET", url: "https://api.example.com/data", save: autoSaveVar };
      } else if (type === "calculation") {
        defaultData = {
          operation: "add",
          operand_a: "{{num1}}",
          operand_b: "{{num2}}",
          save_to: "calc_result",
          label: "Calculation",
        };
      } else if (type === "goto_flow") {
        defaultData = {
          target_flow_id: "",
          target_flow_name: "",
          mode: "subflow",
        };
      } else if (type === "end") {
        defaultData = { text: "Thank you for reaching out!" };
      }

      if (customData) {
        defaultData = { ...defaultData, ...customData };
        // If customData defaulted to "api_result" but an api node with "api_result" already exists, auto-differentiate
        if (type === "api" && defaultData.save === "api_result") {
          const hasExistingApiResult = nodes.some((n) => n.type === "api" && (n.data as any)?.save === "api_result");
          if (hasExistingApiResult) {
            const count = nodes.filter((n) => n.type === "api").length;
            defaultData.save = `api_result_${count + 1}`;
          }
        }
      }

      const newNode: Node = {
        id: newNodeId,
        type,
        position: finalPosition,
        data: defaultData,
      };

      setNodes((nds) => {
        const nextNodes = [...nds, newNode];
        pushHistory(nextNodes, edges);
        return nextNodes;
      });
      setSelectedNodeId(newNodeId);
      setContextMenu(null);
    },
    [adjustAntiCollision, edges, getSmartPosition, nodes, pushHistory, setNodes]
  );

  // Insert another workflow (goto_flow) in between a step and its next step
  const handleInsertWorkflowBetween = useCallback(
    (
      afterNodeId: string,
      targetFlow: { id: string; name: string },
      mode: "subflow" | "handoff"
    ) => {
      const afterNode = nodes.find((n) => n.id === afterNodeId);
      if (!afterNode) return;

      const newNodeId = `node_goto_flow_${Date.now()}`;
      const outgoing = edges.filter((e) => e.source === afterNodeId);
      const firstOutgoing = outgoing[0];
      const nextTargetNode = firstOutgoing ? nodes.find((n) => n.id === firstOutgoing.target) : null;

      const rawPosition = nextTargetNode
        ? {
            x: Math.round((afterNode.position.x + nextTargetNode.position.x) / 2),
            y: Math.round((afterNode.position.y + nextTargetNode.position.y) / 2),
          }
        : {
            x: afterNode.position.x,
            y: afterNode.position.y + 180,
          };

      const finalPosition = adjustAntiCollision(rawPosition, nodes);

      const newNode: Node = {
        id: newNodeId,
        type: "goto_flow",
        position: finalPosition,
        data: {
          target_flow_id: targetFlow.id,
          target_flow_name: targetFlow.name,
          mode,
        },
      };

      let nextEdges = [...edges];
      if (firstOutgoing && mode === "subflow") {
        nextEdges = nextEdges.filter((e) => e.id !== firstOutgoing.id);
        nextEdges.push(
          {
            id: `edge_${afterNodeId}_${newNodeId}_${Date.now()}`,
            source: afterNodeId,
            sourceHandle: firstOutgoing.sourceHandle || undefined,
            target: newNodeId,
            type: "smoothstep",
            animated: true,
          },
          {
            id: `edge_${newNodeId}_${firstOutgoing.target}_${Date.now() + 1}`,
            source: newNodeId,
            sourceHandle: "completed",
            target: firstOutgoing.target,
            targetHandle: firstOutgoing.targetHandle || undefined,
            type: "smoothstep",
            animated: true,
          }
        );
      } else {
        nextEdges.push({
          id: `edge_${afterNodeId}_${newNodeId}_${Date.now()}`,
          source: afterNodeId,
          target: newNodeId,
          type: "smoothstep",
          animated: true,
        });
      }

      const nextNodes = [...nodes, newNode];
      setNodes(nextNodes);
      setEdges(nextEdges);
      pushHistory(nextNodes, nextEdges);
      setSelectedNodeId(newNodeId);
      message.success(`Inserted workflow "${targetFlow.name}" (${mode}) after selected step.`);
    },
    [adjustAntiCollision, edges, nodes, pushHistory, setEdges, setNodes]
  );

  // Track canvas cursor coordinates
  const onPaneMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const flowPos = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      lastCanvasPointerRef.current = {
        x: Math.round(flowPos.x - 110),
        y: Math.round(flowPos.y - 35),
      };
    },
    [screenToFlowPosition]
  );

  // Right-click Context Menu on canvas to place node precisely where pointing
  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const flowPos = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        flowPos: {
          x: Math.round(flowPos.x - 110),
          y: Math.round(flowPos.y - 35),
        },
      });
    },
    [screenToFlowPosition]
  );

  // Drag & Drop handlers with accurate screen-to-flow coordinate transformation
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow/type") as NodeType;
      if (!type) return;

      const customDataStr = event.dataTransfer.getData("application/reactflow/customData");
      let customData: Record<string, any> | undefined;
      if (customDataStr) {
        try {
          customData = JSON.parse(customDataStr);
        } catch {}
      }

      const flowPos = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const position = {
        x: Math.round(flowPos.x - 110),
        y: Math.round(flowPos.y - 35),
      };

      handleAddNode(type, position, customData);
    },
    [handleAddNode, screenToFlowPosition]
  );

  // Cross-Flow & Intra-Flow Copy Selection to Clipboard
  const handleCopySelection = useCallback(() => {
    // Find selected nodes (either by .selected or selectedNodeId)
    let targets = nodes.filter((n) => n.selected);
    if (targets.length === 0 && selectedNodeId) {
      const single = nodes.find((n) => n.id === selectedNodeId);
      if (single) targets = [single];
    }

    // If still nothing explicitly selected, copy all nodes on the canvas
    if (targets.length === 0) {
      if (nodes.length === 0) {
        message.info("Canvas is empty. Add nodes before copying.");
        return;
      }
      targets = [...nodes];
    }

    const targetIds = new Set(targets.map((n) => n.id));

    // Capture all internal edges connecting the selected nodes
    const internalEdges = edges.filter(
      (e) => targetIds.has(e.source) && targetIds.has(e.target)
    );

    const payload = {
      type: "WA_WORKFLOW_DESIGN_CLIPBOARD",
      version: 1,
      sourceWorkflowId: workflowId,
      sourceWorkflowName: name,
      copiedAt: new Date().toISOString(),
      nodes: targets.map((n) => ({
        id: n.id,
        type: n.type,
        position: { x: n.position.x, y: n.position.y },
        data: JSON.parse(JSON.stringify(n.data || {})),
      })),
      edges: internalEdges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle || "next",
        target: e.target,
      })),
    };

    try {
      const jsonStr = JSON.stringify(payload);
      localStorage.setItem("wa_workflow_design_clipboard", jsonStr);
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(jsonStr).catch(() => {});
      }
      setHasClipboard(true);
      message.success(
        `Copied ${targets.length} node${targets.length > 1 ? "s" : ""}${
          internalEdges.length > 0
            ? ` and ${internalEdges.length} connection${internalEdges.length > 1 ? "s" : ""}`
            : ""
        } to clipboard!`
      );
    } catch {
      message.error("Failed to copy design to clipboard.");
    }
  }, [nodes, edges, selectedNodeId, workflowId, name]);

  // Paste Copied Design from Clipboard (into this workflow or another workflow)
  const handlePasteClipboard = useCallback(
    async (pastePos?: { x: number; y: number }) => {
      let clipboardDataStr: string | null = null;
      try {
        clipboardDataStr = localStorage.getItem("wa_workflow_design_clipboard");
      } catch {}

      if (!clipboardDataStr && navigator.clipboard?.readText) {
        try {
          clipboardDataStr = await navigator.clipboard.readText();
        } catch {}
      }

      if (!clipboardDataStr) {
        message.info("Clipboard is empty. Select nodes and press Ctrl+C to copy first.");
        return;
      }

      let payload: any = null;
      try {
        payload = JSON.parse(clipboardDataStr);
      } catch {
        message.error("Clipboard does not contain valid workflow design data.");
        return;
      }

      if (!payload || !Array.isArray(payload.nodes) || payload.nodes.length === 0) {
        message.info("Clipboard does not contain any workflow nodes.");
        return;
      }

      // 1. Calculate bounding box of copied nodes to calculate relative offset
      const minX = Math.min(...payload.nodes.map((n: any) => n.position.x));
      const minY = Math.min(...payload.nodes.map((n: any) => n.position.y));

      let offsetX = 50;
      let offsetY = 50;

      if (pastePos) {
        offsetX = pastePos.x - minX;
        offsetY = pastePos.y - minY;
      } else if (lastCanvasPointerRef.current) {
        offsetX = lastCanvasPointerRef.current.x - minX;
        offsetY = lastCanvasPointerRef.current.y - minY;
      } else if (selectedNodeId) {
        const selected = nodes.find((n) => n.id === selectedNodeId);
        if (selected) {
          offsetX = selected.position.x - minX + 40;
          offsetY = selected.position.y - minY + 120;
        }
      } else {
        const bounds = reactFlowWrapper.current?.getBoundingClientRect();
        if (bounds) {
          const centerScreen = {
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2,
          };
          const flowCenter = screenToFlowPosition(centerScreen);
          offsetX = Math.round(flowCenter.x - 110 - minX);
          offsetY = Math.round(flowCenter.y - 45 - minY);
        }
      }

      // 2. ID remapping and node construction with new unique IDs
      const idMap = new Map<string, string>();
      const existingTrigger = nodes.find((n) => n.type === "trigger");
      let triggerConverted = false;

      const newNodes: Node[] = [];

      for (const orig of payload.nodes) {
        let nodeType = orig.type;
        let nodeData = JSON.parse(JSON.stringify(orig.data || {}));

        // Strict Meta/Graph Rule: A workflow must have exactly one Trigger node
        if (nodeType === "trigger" && existingTrigger) {
          nodeType = "message";
          nodeData = {
            text: orig.data?.keyword
              ? `Triggered on: ${orig.data.keyword}`
              : (orig.data?.text || "Pasted Step"),
          };
          triggerConverted = true;
        }

        const newId = `node_${nodeType}_${Date.now().toString().slice(-4)}_${Math.random().toString(36).substring(2, 6)}`;
        idMap.set(orig.id, newId);

        newNodes.push({
          id: newId,
          type: nodeType,
          position: {
            x: Math.round(orig.position.x + offsetX),
            y: Math.round(orig.position.y + offsetY),
          },
          data: nodeData,
          selected: true, // auto-select pasted nodes so user can move them as a group
        });
      }

      // 3. Remap connecting edges
      const newEdges: Edge[] = [];
      if (Array.isArray(payload.edges)) {
        for (const origEdge of payload.edges) {
          const newSource = idMap.get(origEdge.source);
          const newTarget = idMap.get(origEdge.target);
          if (newSource && newTarget) {
            const port = origEdge.sourceHandle || "next";
            newEdges.push({
              id: `e_${newSource}_${port}_${newTarget}_${Date.now().toString().slice(-4)}`,
              source: newSource,
              sourceHandle: port,
              target: newTarget,
              animated: true,
              style: { stroke: "#10b981", strokeWidth: 2 },
            });
          }
        }
      }

      // Deselect previously selected nodes and append newly pasted nodes
      setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes]);
      setEdges((eds) => [...eds, ...newEdges]);

      if (newNodes.length > 0) {
        setSelectedNodeId(newNodes[0].id);
      }

      pushHistory([...nodes, ...newNodes], [...edges, ...newEdges]);

      let msg = `Pasted ${newNodes.length} node${newNodes.length > 1 ? "s" : ""}${
        newEdges.length > 0 ? ` with ${newEdges.length} connection${newEdges.length > 1 ? "s" : ""}` : ""
      }!`;
      if (triggerConverted) {
        msg += " (Trigger node converted to Message to maintain 1-trigger rule)";
      }
      message.success(msg);
    },
    [nodes, edges, selectedNodeId, screenToFlowPosition, pushHistory, setNodes, setEdges]
  );

  // Keyboard Shortcuts (Delete, Backspace, Ctrl+C copy, Ctrl+V paste, Ctrl+A select all, Ctrl+D duplicate, Ctrl+Z/Ctrl+Y undo/redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      if (activeTag === "input" || activeTag === "textarea") return;

      const isModifier = e.ctrlKey || e.metaKey;

      // Copy Selection (Ctrl + C / Cmd + C)
      if (isModifier && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCopySelection();
        return;
      }

      // Paste from Clipboard (Ctrl + V / Cmd + V)
      if (isModifier && e.key.toLowerCase() === "v") {
        e.preventDefault();
        handlePasteClipboard();
        return;
      }

      // Select All Nodes (Ctrl + A / Cmd + A)
      if (isModifier && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        return;
      }

      // Delete Node
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId) {
        const node = nodes.find((n) => n.id === selectedNodeId);
        if (node && node.type !== "trigger") {
          e.preventDefault();
          handleDeleteNode(selectedNodeId);
        }
      }

      // Duplicate Node (Ctrl + D)
      if (isModifier && e.key.toLowerCase() === "d" && selectedNodeId) {
        e.preventDefault();
        const node = nodes.find((n) => n.id === selectedNodeId);
        if (node && node.type !== "trigger") {
          handleAddNode(
            node.type as NodeType,
            {
              x: node.position.x + 40,
              y: node.position.y + 40,
            },
            JSON.parse(JSON.stringify(node.data || {}))
          );
        }
      }

      // Undo (Ctrl + Z)
      if (isModifier && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (historyIndexRef.current > 0) {
          e.preventDefault();
          historyIndexRef.current -= 1;
          const snap = historyRef.current[historyIndexRef.current];
          if (snap) {
            setNodes(snap.nodes);
            setEdges(snap.edges);
          }
        }
      }

      // Redo (Ctrl + Y or Ctrl + Shift + Z)
      if (isModifier && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        if (historyIndexRef.current < historyRef.current.length - 1) {
          e.preventDefault();
          historyIndexRef.current += 1;
          const snap = historyRef.current[historyIndexRef.current];
          if (snap) {
            setNodes(snap.nodes);
            setEdges(snap.edges);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedNodeId,
    nodes,
    edges,
    handleDeleteNode,
    handleAddNode,
    handleCopySelection,
    handlePasteClipboard,
    setNodes,
    setEdges,
  ]);

  // Construct standard WorkflowGraph structure from ReactFlow state
  const getCurrentGraph = (): WorkflowGraph => {
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as NodeType,
        position: n.position,
        data: n.data,
      })),
      edges: edges.map((e) => {
        const sourceNode = nodes.find((n) => n.id === e.source);
        let port = (e.sourceHandle as string) || "next";
        // If source is a dynamic list, any outgoing edge represents the "next" transition
        if (sourceNode?.type === "list" && (sourceNode.data?.is_dynamic || sourceNode.data?.dynamicRows)) {
          if (!port || port.startsWith("row_") || port.startsWith("opt_")) {
            port = "next";
          }
        }
        return {
          id: e.id,
          from: e.source,
          port,
          to: e.target,
        };
      }),
    };
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const currentGraph = getCurrentGraph();
      await onSave(currentGraph, name);
      message.success("Draft saved successfully!");
    } catch (err: any) {
      message.error(err.message || "Failed to save draft.");
    } finally {
      setSaving(false);
    }
  };

  const handlePublishFlow = async () => {
    setPublishing(true);
    try {
      const currentGraph = getCurrentGraph();
      await onPublish(currentGraph);
      setStatus("active");
    } finally {
      setPublishing(false);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) as any;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 72px)", overflow: "hidden" }}>
      <WorkflowHeader
        workflowId={workflowId}
        name={name}
        version={version}
        status={status}
        graph={getCurrentGraph()}
        onSaveDraft={handleSaveDraft}
        onPublish={handlePublishFlow}
        onNameChange={(newName) => setName(newName)}
        saving={saving}
        publishing={publishing}
        onCopySelection={handleCopySelection}
        onPasteClipboard={() => handlePasteClipboard()}
        hasSelection={nodes.some((n) => n.selected) || Boolean(selectedNodeId)}
        hasClipboard={hasClipboard}
      />

      <div style={{ display: "flex", flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Center Canvas */}
        <div ref={reactFlowWrapper} style={{ flex: 1, height: "100%", position: "relative", background: "var(--bg-canvas, #ffffff)" }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onPaneMouseMove={onPaneMouseMove}
            onPaneContextMenu={onPaneContextMenu}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border, #e2e8f0)" gap={16} size={1} />
            <Controls style={{ background: "var(--bg-card, #ffffff)", border: "1px solid var(--border, #eaecf0)", fill: "var(--text-primary, #101828)" }} />
            <MiniMap
              nodeColor={(n) => {
                if (n.type === "trigger") return "#eab308";
                if (n.type === "message") return "#3b82f6";
                if (n.type === "buttons") return "#a855f7";
                if (n.type === "list") return "#0ea5e9";
                if (n.type === "ask") return "#f97316";
                if (n.type === "api") return "#10b981";
                return "#6b7280";
              }}
              style={{ background: "var(--bg-card, #ffffff)", border: "1px solid var(--border, #eaecf0)" }}
            />
          </ReactFlow>

          {/* Right-Click Quick-Add Context Menu */}
          {contextMenu && (
            <div
              style={{
                position: "fixed",
                top: contextMenu.y,
                left: contextMenu.x,
                zIndex: 9999,
                background: "var(--bg-card, #ffffff)",
                border: "1px solid var(--border, #eaecf0)",
                borderRadius: "12px",
                boxShadow: "0 12px 36px rgba(16, 24, 40, 0.12)",
                padding: "8px",
                minWidth: "190px",
                animation: "fadeIn 0.15s ease-out",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  fontSize: "10.5px",
                  fontWeight: 700,
                  color: "var(--text-secondary, #475467)",
                  padding: "4px 8px 6px 8px",
                  borderBottom: "1px solid var(--border, #eaecf0)",
                  marginBottom: "4px",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                }}
              >
                Add Node Here
              </div>

              {/* Paste from Clipboard if available */}
              {hasClipboard && (
                <div
                  onClick={() => {
                    handlePasteClipboard(contextMenu.flowPos);
                    setContextMenu(null);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    background: "#f0fdf9",
                    color: "#047857",
                    marginBottom: "6px",
                    border: "1px dashed #a7f3d0",
                  }}
                >
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "6px",
                      background: "rgba(16, 185, 129, 0.15)",
                      color: "#10b981",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <ClipboardPaste size={14} />
                  </div>
                  <span>Paste Design (Ctrl+V)</span>
                </div>
              )}
              {CONTEXT_MENU_ITEMS.map((item, idx) => (
                <div
                  key={`${item.type}_${idx}`}
                  onClick={() => handleAddNode(item.type, contextMenu.flowPos, item.customData)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "12.5px",
                    fontWeight: 500,
                    color: "var(--text-primary, #101828)",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = item.bg;
                    e.currentTarget.style.color = item.color;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--text-primary, #101828)";
                  }}
                >
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "6px",
                      background: item.bg,
                      color: item.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </div>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Unified Sidebar: Node Palette & Selected Node Details */}
        <InspectorPanel
          selectedNode={selectedNode || null}
          graph={getCurrentGraph()}
          projectId={projectId}
          currentWorkflowId={workflowId}
          onUpdateNodeData={handleUpdateNodeData}
          onDeleteNode={handleDeleteNode}
          onCopyNode={handleCopySelection}
          onAddNode={(type, customData) => handleAddNode(type, undefined, customData)}
          onInsertWorkflowBetween={handleInsertWorkflowBetween}
        />
      </div>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInternal {...props} />
    </ReactFlowProvider>
  );
}
