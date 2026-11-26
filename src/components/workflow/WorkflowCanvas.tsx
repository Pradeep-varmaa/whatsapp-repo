"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Panel,
  Background,
  MiniMap,
  Edge,
  Node,
  Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Copy, ClipboardPaste, LayoutGrid } from "lucide-react";
import { message, Modal } from "antd";

import { nodeTypes } from "./nodes";
import { NodePalette } from "./NodePalette";
import { InspectorPanel } from "./InspectorPanel";
import { WorkflowHeader } from "./WorkflowHeader";
import { StepAddEdge, StepAddEdgeData } from "./StepAddEdge";
import { StepAddPopover } from "./StepAddPopover";
import {
  computeExecutionOrder,
  autoLayoutWorkflow,
  insertNodeIntoEdge,
  appendNodeAfter,
  deleteNodeAndReconnect,
  getNodeTypeName,
  STEP_TYPE_PRESETS,
} from "./workflowUtils";
import { NodeType, WorkflowGraph } from "@/server/workflows/types";

// =========================================================================
// FEATURE FLAGS (Easy to toggle back in future updates)
// =========================================================================
export const ENABLE_DRAG_AND_DROP = true;
export const SHOW_LIVE_PREVIEW = false;

const edgeTypes = {
  stepAddEdge: StepAddEdge,
};

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
  const { screenToFlowPosition, flowToScreenPosition, fitView } = useReactFlow();
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
      position: n.position || { x: 350, y: 100 },
      data: n.data || {},
    }))
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    (initialGraph.edges || []).map((e, idx) => ({
      id: e.id || `e_${e.from}_${e.port}_${e.to}_${idx}`,
      source: e.from,
      sourceHandle: e.port,
      target: e.to,
      type: "stepAddEdge",
      animated: false,
      style: { stroke: "#94a3b8", strokeWidth: 1.8 },
    }))
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [hasClipboard, setHasClipboard] = useState(false);
  const [deleteConfirmNodeId, setDeleteConfirmNodeId] = useState<string | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Active Add Step Popover State
  const [activeAddPopover, setActiveAddPopover] = useState<{
    type: "edge" | "tail";
    id: string; // edgeId or sourceNodeId
    screenPos: { x: number; y: number };
    anchorTitle: string;
    sourceHandle?: string;
  } | null>(null);

  // Sync clipboard state
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

  // Compute execution order and validation errors
  const executionSteps = useMemo(() => {
    return computeExecutionOrder(nodes, edges);
  }, [nodes, edges]);

  const executionMap = useMemo(() => {
    return new Map(executionSteps.map((s) => [s.node.id, s]));
  }, [executionSteps]);

  // Handle Tidy Up (Auto-Layout)
  const handleTidyUp = useCallback(() => {
    const laidOut = autoLayoutWorkflow(nodes, edges);
    setNodes(laidOut);
    pushHistory(laidOut, edges);
    setTimeout(() => {
      fitView({ duration: 400 });
    }, 50);
  }, [nodes, edges, fitView, pushHistory, setNodes]);

  // Open Popover on Edge Click
  const handleOpenAddStepOnEdge = useCallback(
    (edgeId: string, _flowPos: { x: number; y: number }, source: string) => {
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) return;

      const sourceNode = nodes.find((n) => n.id === source);
      const sourceStepInfo = executionMap.get(source);
      const anchorTitle = sourceStepInfo
        ? `${sourceStepInfo.stepNumber} · ${sourceStepInfo.title}`
        : getNodeTypeName(sourceNode?.type || "", sourceNode?.data);

      const targetNode = nodes.find((n) => n.id === edge.target);
      const midFlowX = sourceNode && targetNode ? (sourceNode.position.x + targetNode.position.x) / 2 + 100 : 350;
      const midFlowY = sourceNode && targetNode ? (sourceNode.position.y + targetNode.position.y) / 2 + 60 : 250;
      const screenPos = flowToScreenPosition({ x: midFlowX, y: midFlowY });

      // Calculate relative position within wrapper
      const wrapperRect = reactFlowWrapper.current?.getBoundingClientRect();
      const relativeX = wrapperRect ? screenPos.x - wrapperRect.left : screenPos.x;
      const relativeY = wrapperRect ? screenPos.y - wrapperRect.top : screenPos.y;

      setActiveAddPopover({
        type: "edge",
        id: edgeId,
        screenPos: { x: relativeX, y: relativeY },
        anchorTitle,
      });
    },
    [edges, nodes, executionMap, flowToScreenPosition]
  );

  // Open Popover on Tail Click
  const handleOpenAddStepOnTail = useCallback(
    (nodeId: string, event: React.MouseEvent) => {
      const sourceNode = nodes.find((n) => n.id === nodeId);
      const sourceStepInfo = executionMap.get(nodeId);
      const anchorTitle = sourceStepInfo
        ? `${sourceStepInfo.stepNumber} · ${sourceStepInfo.title}`
        : getNodeTypeName(sourceNode?.type || "", sourceNode?.data);

      const wrapperRect = reactFlowWrapper.current?.getBoundingClientRect();
      const relativeX = wrapperRect ? event.clientX - wrapperRect.left : event.clientX;
      const relativeY = wrapperRect ? event.clientY - wrapperRect.top : event.clientY;

      setActiveAddPopover({
        type: "tail",
        id: nodeId,
        screenPos: { x: relativeX, y: relativeY },
        anchorTitle,
      });
    },
    [nodes, executionMap]
  );

  // Add Step from Popover
  const handleSelectStepFromPopover = useCallback(
    (type: NodeType, customData?: Record<string, any>) => {
      if (!activeAddPopover) return;

      if (activeAddPopover.type === "edge") {
        const res = insertNodeIntoEdge(nodes, edges, activeAddPopover.id, type, customData);
        const laidOut = autoLayoutWorkflow(res.newNodes, res.newEdges);
        setNodes(laidOut);
        setEdges(res.newEdges);
        setSelectedNodeId(res.newNodeId);
        pushHistory(laidOut, res.newEdges);
        setTimeout(() => fitView({ nodes: [{ id: res.newNodeId }], duration: 400 }), 60);
      } else if (activeAddPopover.type === "tail") {
        const res = appendNodeAfter(nodes, edges, activeAddPopover.id, type, customData, activeAddPopover.sourceHandle);
        const laidOut = autoLayoutWorkflow(res.newNodes, res.newEdges);
        setNodes(laidOut);
        setEdges(res.newEdges);
        setSelectedNodeId(res.newNodeId);
        pushHistory(laidOut, res.newEdges);
        setTimeout(() => fitView({ nodes: [{ id: res.newNodeId }], duration: 400 }), 60);
      }

      setActiveAddPopover(null);
    },
    [activeAddPopover, nodes, edges, fitView, pushHistory, setNodes, setEdges]
  );

  // Delete Node with Auto-Reconnection
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const targetNode = nodes.find((n) => n.id === nodeId);
      if (targetNode?.type === "trigger") {
        message.warning("The Trigger node cannot be deleted.");
        return;
      }

      const res = deleteNodeAndReconnect(nodes, edges, nodeId);
      if (!res.success) {
        if (res.error) message.warning(res.error);
        return;
      }

      if (res.reconnected) {
        setNodes(res.newNodes);
        setEdges(res.newEdges);
        setSelectedNodeId(null);
        pushHistory(res.newNodes, res.newEdges);
        message.success("Deleted step and reconnected connection.");
        return;
      }

      if (res.requiresConfirm) {
        setDeleteConfirmNodeId(nodeId);
        return;
      }

      setNodes(res.newNodes);
      setEdges(res.newEdges);
      setSelectedNodeId(null);
      pushHistory(res.newNodes, res.newEdges);
      message.success("Step deleted.");
    },
    [nodes, edges, pushHistory, setNodes, setEdges]
  );

  const handleConfirmDelete = () => {
    if (!deleteConfirmNodeId) return;
    const newNodes = nodes.filter((n) => n.id !== deleteConfirmNodeId);
    const newEdges = edges.filter((e) => e.source !== deleteConfirmNodeId && e.target !== deleteConfirmNodeId);
    setNodes(newNodes);
    setEdges(newEdges);
    setSelectedNodeId(null);
    pushHistory(newNodes, newEdges);
    setDeleteConfirmNodeId(null);
    message.success("Step and connected branches deleted.");
  };

  // Node Selection
  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
    setActiveAddPopover(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setActiveAddPopover(null);
  }, []);

  // Dragging support: push history on drag stop
  const handleNodeDragStop = useCallback(
    (_event: any) => {
      pushHistory(nodes, edges);
    },
    [nodes, edges, pushHistory]
  );

  // Drag & Drop handlers: palette items dropped onto canvas
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

      const newNodeId = `node_${type}_${Math.floor(1000 + Math.random() * 9000)}`;
      const preset = STEP_TYPE_PRESETS.find((p) => p.type === type);
      const nodeData = {
        ...(preset?.customData ? JSON.parse(JSON.stringify(preset.customData)) : {}),
        ...(customData || {}),
      };

      if (type === "api") {
        const existingApiCount = nodes.filter((n) => n.type === "api").length;
        if (existingApiCount > 0 && (!nodeData.save || nodeData.save === "api_result")) {
          nodeData.save = `api_result_${existingApiCount + 1}`;
        }
      }

      const newNode: Node = {
        id: newNodeId,
        type,
        position,
        data: nodeData,
      };

      const newNodes = [...nodes, newNode];
      setNodes(newNodes);
      setSelectedNodeId(newNodeId);
      pushHistory(newNodes, edges);
    },
    [nodes, edges, screenToFlowPosition, pushHistory, setNodes]
  );

  // Add node directly from palette click
  const handleAddNodeFromPalette = useCallback(
    (type: NodeType, customData?: Record<string, any>) => {
      const maxY = nodes.reduce((max, n) => Math.max(max, n.position.y), 100);
      const posX = 350;
      const posY = maxY + 140;

      const newNodeId = `node_${type}_${Math.floor(1000 + Math.random() * 9000)}`;
      const preset = STEP_TYPE_PRESETS.find((p) => p.type === type);
      const nodeData = {
        ...(preset?.customData ? JSON.parse(JSON.stringify(preset.customData)) : {}),
        ...(customData || {}),
      };

      if (type === "api") {
        const existingApiCount = nodes.filter((n) => n.type === "api").length;
        if (existingApiCount > 0 && (!nodeData.save || nodeData.save === "api_result")) {
          nodeData.save = `api_result_${existingApiCount + 1}`;
        }
      }

      const newNode: Node = {
        id: newNodeId,
        type,
        position: { x: posX, y: posY },
        data: nodeData,
      };

      const newNodes = [...nodes, newNode];
      setNodes(newNodes);
      setSelectedNodeId(newNodeId);
      pushHistory(newNodes, edges);
      fitView({ nodes: [{ id: newNodeId }], duration: 400 });
    },
    [nodes, edges, pushHistory, setNodes, fitView]
  );

  // Connect handle-to-handle drag
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      if (params.source === params.target) return;

      const newEdgeId = `e_${params.source}_${params.sourceHandle || "next"}_${params.target}_${Date.now().toString().slice(-4)}`;
      const newEdge: Edge = {
        id: newEdgeId,
        source: params.source,
        sourceHandle: params.sourceHandle || "next",
        target: params.target,
        type: "stepAddEdge",
        animated: false,
        style: { stroke: "#94a3b8", strokeWidth: 1.8 },
      };

      // Filter out existing edge with same source & sourceHandle if single-outgoing
      const srcNode = nodes.find((n) => n.id === params.source);
      let updatedEdges = edges;
      if (srcNode?.type !== "buttons" && srcNode?.type !== "list") {
        updatedEdges = edges.filter(
          (e) => !(e.source === params.source && e.sourceHandle === (params.sourceHandle || "next"))
        );
      }

      const finalEdges = [...updatedEdges, newEdge];
      setEdges(finalEdges);
      pushHistory(nodes, finalEdges);
    },
    [nodes, edges, pushHistory, setEdges]
  );

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

  // Copy Selection to Clipboard
  const handleCopySelection = useCallback(() => {
    let targets = nodes.filter((n) => n.selected);
    if (targets.length === 0 && selectedNodeId) {
      const single = nodes.find((n) => n.id === selectedNodeId);
      if (single) targets = [single];
    }
    if (targets.length === 0) {
      targets = [...nodes];
    }
    if (targets.length === 0) {
      message.info("Canvas is empty.");
      return;
    }

    const targetIds = new Set(targets.map((n) => n.id));
    const internalEdges = edges.filter((e) => targetIds.has(e.source) && targetIds.has(e.target));

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
      message.success(`Copied ${targets.length} step${targets.length > 1 ? "s" : ""} to clipboard.`);
    } catch {
      message.error("Failed to copy to clipboard.");
    }
  }, [nodes, edges, selectedNodeId, workflowId, name]);

  // Paste from Clipboard
  const handlePasteClipboard = useCallback(async () => {
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
      message.info("Clipboard is empty.");
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
      message.info("Clipboard is empty.");
      return;
    }

    const idMap = new Map<string, string>();
    const existingTrigger = nodes.find((n) => n.type === "trigger");
    const newNodes: Node[] = [];

    for (const orig of payload.nodes) {
      let nodeType = orig.type;
      let nodeData = JSON.parse(JSON.stringify(orig.data || {}));

      if (nodeType === "trigger" && existingTrigger) {
        nodeType = "message";
        nodeData = { text: orig.data?.keyword ? `Triggered on: ${orig.data.keyword}` : "Pasted Step" };
      }

      const newId = `node_${nodeType}_${Date.now().toString().slice(-4)}_${Math.random().toString(36).substring(2, 6)}`;
      idMap.set(orig.id, newId);

      newNodes.push({
        id: newId,
        type: nodeType,
        position: { x: orig.position.x + 40, y: orig.position.y + 40 },
        data: nodeData,
        selected: true,
      });
    }

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
            type: "stepAddEdge",
            animated: true,
            style: { stroke: "#10b981", strokeWidth: 2 },
          });
        }
      }
    }

    const combinedNodes = [...nodes.map((n) => ({ ...n, selected: false })), ...newNodes];
    const combinedEdges = [...edges, ...newEdges];
    const laidOut = autoLayoutWorkflow(combinedNodes, combinedEdges);

    setNodes(laidOut);
    setEdges(combinedEdges);
    if (newNodes.length > 0) {
      setSelectedNodeId(newNodes[0].id);
    }
    pushHistory(laidOut, combinedEdges);
    message.success(`Pasted ${newNodes.length} step${newNodes.length > 1 ? "s" : ""}!`);
  }, [nodes, edges, pushHistory, setNodes, setEdges]);

  // Construct WorkflowGraph data structure
  const getCurrentGraph = useCallback((): WorkflowGraph => {
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
  }, [nodes, edges]);

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

  // Keyboard Shortcuts (Delete, Backspace, Ctrl+C, Ctrl+V, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      if (activeTag === "input" || activeTag === "textarea") return;

      const isModifier = e.ctrlKey || e.metaKey;

      if (isModifier && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCopySelection();
        return;
      }

      if (isModifier && e.key.toLowerCase() === "v") {
        e.preventDefault();
        handlePasteClipboard();
        return;
      }

      // Duplicate Node (Ctrl + D)
      if (isModifier && e.key.toLowerCase() === "d" && selectedNodeId) {
        e.preventDefault();
        const node = nodes.find((n) => n.id === selectedNodeId);
        if (node && node.type !== "trigger") {
          handleAddNodeFromPalette(node.type as NodeType, JSON.parse(JSON.stringify(node.data || {})));
        }
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId) {
        e.preventDefault();
        handleDeleteNode(selectedNodeId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, nodes, handleCopySelection, handlePasteClipboard, handleDeleteNode, handleAddNodeFromPalette]);

  // Identify tail nodes (nodes with uncompleted branches or terminal except 'end')
  const tailNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of nodes) {
      if (n.type === "end") continue;
      const outgoing = edges.filter((e) => e.source === n.id);
      if (outgoing.length === 0) {
        ids.add(n.id);
      }
    }
    return ids;
  }, [nodes, edges]);

  // Augment nodes with execution metadata & error status for canvas display
  const augmentedNodes = useMemo(() => {
    return nodes.map((n) => {
      const stepInfo = executionMap.get(n.id);
      const isTail = tailNodeIds.has(n.id);

      return {
        ...n,
        selected: n.id === selectedNodeId,
        data: {
          ...n.data,
          _stepNumber: stepInfo?.stepNumber,
          _hasError: stepInfo?.hasError,
          _isTail: isTail,
          _onAddTailStep: handleOpenAddStepOnTail,
        },
      };
    });
  }, [nodes, executionMap, tailNodeIds, selectedNodeId, handleOpenAddStepOnTail]);

  // Augment edges with interactive handlers for StepAddEdge
  const augmentedEdges = useMemo(() => {
    return edges.map((e) => {
      const isAltBranch = e.sourceHandle === "false" || e.sourceHandle === "error";
      const srcNode = nodes.find((n) => n.id === e.source);
      let branchLabel: string | undefined = undefined;

      if (srcNode?.type === "condition") {
        branchLabel = e.sourceHandle === "true" ? (srcNode.data?.true_label as string) || "On time" : (srcNode.data?.false_label as string) || "Late";
      } else if (srcNode?.type === "goto_flow") {
        branchLabel = e.sourceHandle === "completed" ? "Completed" : "Error";
      } else if (srcNode?.type === "api") {
        branchLabel = e.sourceHandle === "success" ? "Success" : "Error";
      } else if (srcNode?.type === "buttons") {
        const opt = (srcNode.data?.opts as any[])?.find((o) => o.id === e.sourceHandle);
        branchLabel = opt?.title;
      } else if (srcNode?.type === "list") {
        const opt = (srcNode.data?.opts as any[])?.find((o) => o.id === e.sourceHandle);
        branchLabel = opt?.title;
      }

      return {
        ...e,
        type: "stepAddEdge",
        animated: false,
        style: {
          stroke: "#94a3b8",
          strokeWidth: 1.8,
          strokeDasharray: isAltBranch ? "5 5" : undefined,
          ...e.style,
        },
        data: {
          isOpen: activeAddPopover?.id === e.id,
          onOpenAddStep: handleOpenAddStepOnEdge,
          branchLabel,
          isAltBranch,
        } as StepAddEdgeData,
      };
    });
  }, [edges, nodes, activeAddPopover, handleOpenAddStepOnEdge]);

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
        onSelectNode={(nodeId) => {
          setSelectedNodeId(nodeId);
          fitView({ nodes: [{ id: nodeId }], duration: 400 });
        }}
      />

      <div style={{ display: "flex", flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Left Palette (Toggled via toolbar or ENABLE_DRAG_AND_DROP) */}
        {showPalette && (
          <div style={{ position: "relative", zIndex: 10, height: "100%", boxShadow: "2px 0 12px rgba(0,0,0,0.06)" }}>
            <NodePalette onAddNode={handleAddNodeFromPalette} />
          </div>
        )}

        {/* Center Canvas */}
        <div
          ref={reactFlowWrapper}
          onDragOver={onDragOver}
          onDrop={onDrop}
          style={{
            flex: 1,
            height: "100%",
            position: "relative",
            background: "var(--bg-canvas, #ffffff)",
          }}
        >
          <ReactFlow
            nodes={augmentedNodes}
            edges={augmentedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodeDragStop={handleNodeDragStop}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={true}
            nodesConnectable={true}
            elementsSelectable={true}
            panOnDrag={true}
            zoomOnScroll={true}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#cbd5e1" gap={16} size={1.2} variant={"dots" as any} />

            {/* Top-Left Floating Canvas Toolbar: Palette toggle, Tidy up & Fit view */}
            <Panel position="top-left">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "rgba(255, 255, 255, 0.96)",
                  backdropFilter: "blur(8px)",
                  padding: "6px 8px",
                  borderRadius: "10px",
                  border: "1px solid #eaecf0",
                  boxShadow: "0 2px 8px rgba(16, 24, 40, 0.08)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowPalette((prev) => !prev)}
                  title={showPalette ? "Hide Steps Palette" : "Open Steps Palette (Drag & drop steps onto canvas)"}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: showPalette ? "1px solid #2563eb" : "1px solid #d0d5dd",
                    background: showPalette ? "#eff6ff" : "#ffffff",
                    color: showPalette ? "#1d4ed8" : "#344054",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    outline: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  onMouseEnter={(e) => {
                    if (!showPalette) e.currentTarget.style.background = "#f9fafb";
                  }}
                  onMouseLeave={(e) => {
                    if (!showPalette) e.currentTarget.style.background = "#ffffff";
                  }}
                >
                  <LayoutGrid size={13} strokeWidth={2.4} />
                  <span>{showPalette ? "Close Palette" : "Steps Palette"}</span>
                </button>
                <div style={{ width: "1px", height: "18px", background: "#e2e8f0" }} />
                <button
                  type="button"
                  onClick={handleTidyUp}
                  title="Auto-arrange steps hierarchically"
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid #d0d5dd",
                    background: "#ffffff",
                    color: "#344054",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    outline: "none",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
                >
                  Tidy up
                </button>
                <button
                  type="button"
                  onClick={() => fitView({ duration: 400 })}
                  title="Center all steps in viewport"
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid #d0d5dd",
                    background: "#ffffff",
                    color: "#344054",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    outline: "none",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
                >
                  Fit view
                </button>
              </div>
            </Panel>

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
              style={{ background: "#ffffff", border: "1px solid #eaecf0" }}
            />
          </ReactFlow>

          {/* Add Step Popover Card */}
          {activeAddPopover && (
            <StepAddPopover
              anchorTitle={activeAddPopover.anchorTitle}
              position={activeAddPopover.screenPos}
              onSelectStep={handleSelectStepFromPopover}
              onClose={() => setActiveAddPopover(null)}
            />
          )}
        </div>

        {/* Right Panel: All Steps (N) + Selected Step Form */}
        <InspectorPanel
          selectedNode={selectedNode || null}
          graph={getCurrentGraph()}
          projectId={projectId}
          currentWorkflowId={workflowId}
          onUpdateNodeData={handleUpdateNodeData}
          onDeleteNode={handleDeleteNode}
          onCopyNode={handleCopySelection}
          onSelectNode={(nodeId) => {
            setSelectedNodeId(nodeId);
            fitView({ nodes: [{ id: nodeId }], duration: 400 });
          }}
        />
      </div>

      {/* Delete Branch Confirmation Modal */}
      <Modal
        title="Confirm Delete Step"
        open={Boolean(deleteConfirmNodeId)}
        onOk={handleConfirmDelete}
        onCancel={() => setDeleteConfirmNodeId(null)}
        okText="Delete"
        okButtonProps={{ danger: true }}
      >
        <p style={{ fontSize: "13px", color: "#475467", margin: "8px 0" }}>
          This step has multiple incoming or outgoing connections. Deleting it will remove the connected branches. Are you sure you want to proceed?
        </p>
      </Modal>
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
