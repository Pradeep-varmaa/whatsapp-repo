"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Table, Tag, Button, Timeline, Empty, Spin } from "antd";
import { ArrowLeft, RefreshCw, GitBranch, Terminal } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

interface RunLog {
  id: string;
  nodeId: string | null;
  event: string;
  detail: unknown;
  createdAt: string;
}

interface WorkflowRunItem {
  id: string;
  workflowId: string;
  workflowVersion: number;
  customerPhone: string;
  currentNodeId: string | null;
  status: string;
  context: Record<string, unknown>;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
  logs: RunLog[];
}

export default function WorkflowRunsTracePage() {
  const params = useParams<{ id: string }>();
  const workflowId = params?.id || "";
  const [runs, setRuns] = useState<WorkflowRunItem[]>([]);
  const [selectedRun, setSelectedRun] = useState<WorkflowRunItem | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRuns = useCallback(async () => {
    if (!workflowId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/runs`);
      const data = await res.json();
      if (data.success) {
        const list = data.data || [];
        setRuns(list);
        if (!selectedRun && list.length > 0) {
          setSelectedRun(list[0]);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [workflowId, selectedRun]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const columns = [
    {
      title: "Run ID",
      dataIndex: "id",
      key: "id",
      render: (id: string) => <code style={{ fontSize: 12 }}>{id}</code>,
    },
    { title: "Customer", dataIndex: "customerPhone", key: "customerPhone" },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (s: string) => (
        <Tag color={s === "completed" ? "success" : s === "failed" ? "error" : "processing"}>
          {s.toUpperCase()}
        </Tag>
      ),
    },
    { title: "Steps", dataIndex: "stepCount", key: "stepCount" },
    {
      title: "Updated",
      dataIndex: "updatedAt",
      key: "updatedAt",
      render: (d: string) => new Date(d).toLocaleString(),
    },
  ];

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/workflows">
            <Button icon={<ArrowLeft size={15} />}>Back</Button>
          </Link>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <GitBranch size={20} color="#25D366" />
              Workflow Execution Trace
            </h1>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Workflow ID: {workflowId}</div>
          </div>
        </div>
        <Button icon={<RefreshCw size={15} />} onClick={loadRuns} loading={loading}>
          Refresh
        </Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        <GlassCard style={{ padding: 16 }}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={runs}
            loading={loading}
            size="small"
            pagination={{ pageSize: 10 }}
            onRow={(record) => ({
              onClick: () => setSelectedRun(record),
              style: {
                cursor: "pointer",
                background: selectedRun?.id === record.id ? "rgba(37, 211, 102, 0.12)" : undefined,
              },
            })}
          />
        </GlassCard>

        <GlassCard style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {!selectedRun ? (
            loading ? <Spin /> : <Empty description="Select a workflow run to inspect step trace" />
          ) : (
            <>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                  <Terminal size={16} color="#25D366" />
                  Step Timeline ({selectedRun.logs.length} events)
                </h3>
                <div style={{ marginTop: 12, maxHeight: 280, overflowY: "auto", paddingRight: 8 }}>
                  {selectedRun.logs.length === 0 ? (
                    <Empty description="No audit events recorded for this run" />
                  ) : (
                    <Timeline
                      items={selectedRun.logs.map((log) => ({
                        color: log.event.includes("error") || log.event.includes("fail") ? "red" : "green",
                        children: (
                          <div style={{ fontSize: 12 }}>
                            <strong>{log.event}</strong> {log.nodeId && <Tag>{log.nodeId}</Tag>}
                            <div style={{ opacity: 0.7 }}>{new Date(log.createdAt).toLocaleTimeString()}</div>
                            {log.detail != null && (
                              <pre style={{ marginTop: 4, fontSize: 11, opacity: 0.85, whiteSpace: "pre-wrap" }}>
                                {typeof log.detail === "string" ? log.detail : JSON.stringify(log.detail, null, 2)}
                              </pre>
                            )}
                          </div>
                        ),
                      }))}
                    />
                  )}
                </div>
              </div>

              <div>
                <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Run Context Variables</h4>
                <pre style={{ margin: 0, padding: 12, borderRadius: 8, background: "rgba(0,0,0,0.28)", fontSize: 12, overflowX: "auto", maxHeight: 220 }}>
                  {JSON.stringify(selectedRun.context, null, 2)}
                </pre>
              </div>
            </>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
