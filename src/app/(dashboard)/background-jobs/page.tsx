"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Table, Tag, Button, Select, Space, Modal, message, Badge, Tooltip } from "antd";
import { RefreshCw, RotateCcw, AlertTriangle, Activity, Layers, CheckCircle2, Clock } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { BackgroundJob } from "@/shared/types";

interface QueueMetric {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export default function BackgroundJobsPage() {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [queues, setQueues] = useState<QueueMetric[]>([]);
  const [redisConnected, setRedisConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [queueFilter, setQueueFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedJob, setSelectedJob] = useState<BackgroundJob | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (queueFilter) params.set("queue", queueFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/background-jobs?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setJobs(data.jobs || []);
        setQueues(data.queues || []);
        setRedisConnected(Boolean(data.redisConnected));
      }
    } catch {
      message.error("Failed to fetch background job queues");
    } finally {
      setLoading(false);
    }
  }, [queueFilter, statusFilter]);

  useEffect(() => {
    fetchJobs();
    const timer = setInterval(fetchJobs, 10_000);
    return () => clearInterval(timer);
  }, [fetchJobs]);

  const handleRetryJob = async (job: BackgroundJob) => {
    setRetryingId(job.jobId);
    try {
      const res = await fetch("/api/background-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_job", queueName: job.queueName, jobId: job.jobId }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(data.message || "Job queued for retry");
        fetchJobs();
      } else {
        message.error(data.message || "Retry failed");
      }
    } catch {
      message.error("Network error while retrying job");
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryAllFailed = async () => {
    try {
      const res = await fetch("/api/background-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_all_failed", queueName: queueFilter || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(`Re-queued ${data.retried} failed job(s)`);
        fetchJobs();
      }
    } catch {
      message.error("Failed to bulk-retry jobs");
    }
  };

  const totalFailed = queues.reduce((acc, q) => acc + q.failed, 0);

  const columns = [
    {
      title: "Job ID",
      dataIndex: "jobId",
      key: "jobId",
      render: (id: string) => <code style={{ fontSize: 12 }}>{id}</code>,
    },
    {
      title: "Queue",
      dataIndex: "queueName",
      key: "queueName",
      render: (q: string) => <Tag color="geekblue">{q}</Tag>,
    },
    {
      title: "Type",
      dataIndex: "jobType",
      key: "jobType",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => {
        const color =
          status === "completed"
            ? "success"
            : status === "failed"
              ? "error"
              : status === "active"
                ? "processing"
                : "warning";
        return <Tag color={color}>{status.toUpperCase()}</Tag>;
      },
    },
    {
      title: "Attempts",
      key: "attempts",
      render: (_: unknown, r: BackgroundJob) => `${r.attemptsMade} / ${r.maxAttempts}`,
    },
    {
      title: "Timestamp",
      dataIndex: "timestamp",
      key: "timestamp",
      render: (ts: string) => new Date(ts).toLocaleString(),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: unknown, record: BackgroundJob) => (
        <Space>
          <Button size="small" onClick={() => setSelectedJob(record)}>
            Inspect
          </Button>
          {record.status === "failed" && (
            <Button
              size="small"
              type="primary"
              icon={<RotateCcw size={13} />}
              loading={retryingId === record.jobId}
              onClick={() => handleRetryJob(record)}
            >
              Retry
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            <Activity size={22} color="#25D366" />
            Background Jobs &amp; Dead-Letter Queue
          </h1>
          <p style={{ margin: "4px 0 0", opacity: 0.72, fontSize: 13 }}>
            Monitor BullMQ worker queues, inspect failed payloads, and retry dead-letter jobs.
          </p>
        </div>

        <Space>
          <Badge
            status={redisConnected ? "success" : "warning"}
            text={redisConnected ? "Redis Live" : "In-Memory Fallback"}
          />
          {totalFailed > 0 && (
            <Button danger icon={<RotateCcw size={15} />} onClick={handleRetryAllFailed}>
              Retry All Failed ({totalFailed})
            </Button>
          )}
          <Button icon={<RefreshCw size={15} />} onClick={fetchJobs} loading={loading}>
            Refresh
          </Button>
        </Space>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {queues.map((q) => (
          <GlassCard key={q.queueName} style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Layers size={16} color="#25D366" />
                {q.queueName}
              </span>
              {q.failed > 0 && (
                <Tooltip title="Dead-letter / failed jobs">
                  <Tag color="error" icon={<AlertTriangle size={12} />}>
                    {q.failed} failed
                  </Tag>
                </Tooltip>
              )}
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 13, opacity: 0.85 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Clock size={13} /> Wait: {q.waiting + q.delayed}
              </span>
              <span>Active: {q.active}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#25D366" }}>
                <CheckCircle2 size={13} /> Done: {q.completed}
              </span>
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassCard style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <Select
            style={{ width: 210 }}
            value={queueFilter}
            onChange={setQueueFilter}
            options={[
              { value: "", label: "All Queues" },
              { value: "outbound-messages", label: "outbound-messages" },
              { value: "webhook-forwarding", label: "webhook-forwarding" },
              { value: "status-updates", label: "status-updates" },
            ]}
          />
          <Select
            style={{ width: 180 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "", label: "All Statuses" },
              { value: "failed", label: "Failed (DLQ)" },
              { value: "active", label: "Active" },
              { value: "waiting", label: "Waiting" },
              { value: "delayed", label: "Delayed" },
              { value: "completed", label: "Completed" },
            ]}
          />
        </div>

        <Table
          rowKey={(r) => `${r.queueName}-${r.jobId}`}
          columns={columns}
          dataSource={jobs}
          loading={loading}
          pagination={{ pageSize: 15 }}
          size="middle"
        />
      </GlassCard>

      <Modal
        open={Boolean(selectedJob)}
        onCancel={() => setSelectedJob(null)}
        title={`Job Details: ${selectedJob?.jobId || ""}`}
        footer={null}
        width={680}
      >
        {selectedJob && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {selectedJob.failedReason && (
              <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,77,79,0.12)", border: "1px solid rgba(255,77,79,0.3)" }}>
                <strong>Failure Reason:</strong>
                <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: 12 }}>{selectedJob.failedReason}</div>
              </div>
            )}
            <div>
              <strong>Payload:</strong>
              <pre style={{ marginTop: 6, padding: 12, borderRadius: 8, background: "rgba(0,0,0,0.25)", overflowX: "auto", fontSize: 12 }}>
                {JSON.stringify(selectedJob.data, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
