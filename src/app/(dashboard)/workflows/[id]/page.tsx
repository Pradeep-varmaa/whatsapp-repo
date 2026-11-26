"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { WorkflowCanvas } from "@/components/workflows/WorkflowCanvas";
import { WorkflowGraph } from "@/server/workflows/types";
import { Spin, Alert } from "antd";

export default function WorkflowBuilderPage() {
  const params = useParams();
  const id = params?.id as string;

  const [workflow, setWorkflow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkflow = useCallback(async (workflowId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setWorkflow(json.data);
      } else {
        setError(json.error?.message || "Failed to load workflow.");
      }
    } catch (err: any) {
      setError(err.message || "Network error loading workflow.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) fetchWorkflow(id);
  }, [id, fetchWorkflow]);

  const handleSave = async (graph: WorkflowGraph, name: string) => {
    const triggerNode = graph.nodes?.find((n) => n.type === "trigger");
    const triggerKeyword = typeof triggerNode?.data?.keyword === "string" ? triggerNode.data.keyword.trim() : null;

    const res = await fetch(`/api/workflows/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        graph,
        triggerValue: triggerKeyword,
      }),
    });
    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error?.message || "Failed to save workflow draft.");
    }
    // Update local state with latest version if changed
    setWorkflow((prev: any) => ({
      ...prev,
      name: json.data.name,
      version: json.data.version,
      status: json.data.status,
      graph: json.data.graph,
    }));
  };

  const handlePublish = async (graph: WorkflowGraph) => {
    // First save the current draft
    await handleSave(graph, workflow.name);

    // Then trigger publish
    const res = await fetch(`/api/workflows/${id}/publish`, {
      method: "POST",
    });
    const json = await res.json();
    if (!json.success) {
      const details = json.error?.details ? `\n• ${json.error.details.join("\n• ")}` : "";
      throw new Error((json.error?.message || "Failed to publish workflow.") + details);
    }

    setWorkflow((prev: any) => ({
      ...prev,
      status: "active",
      version: json.data.version,
    }));
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh" }}>
        <Spin size="large" tip="Loading workflow builder..." />
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div style={{ padding: "40px", maxWidth: "600px", margin: "0 auto" }}>
        <Alert
          type="error"
          message="Workflow Error"
          description={error || "Could not retrieve workflow."}
          showIcon
        />
      </div>
    );
  }

  return (
    <WorkflowCanvas
      workflowId={workflow.id}
      initialName={workflow.name}
      initialVersion={workflow.version}
      initialStatus={workflow.status}
      initialGraph={workflow.graph}
      projectId={workflow.projectId}
      onSave={handleSave}
      onPublish={handlePublish}
    />
  );
}
