"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Clock, CheckCircle2, XCircle, AlertCircle, Phone } from "lucide-react";
import { Spin } from "antd";
import styles from "./runs.module.css";

interface AuditLog {
  id: string;
  nodeId: string | null;
  event: string;
  detail: any;
  createdAt: string;
}

interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowVersion: number;
  projectId: string;
  customerPhone: string;
  currentNodeId: string | null;
  status: "running" | "waiting_reply" | "completed" | "failed" | "expired";
  context: Record<string, any>;
  stepCount: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  logs: AuditLog[];
}

export default function WorkflowRunsPage() {
  const params = useParams();
  const id = params?.id as string;

  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workflows/${id}/runs`);
      const json = await res.json();
      if (json.success) {
        setRuns(json.data || []);
      }
    } catch {
      // Error handling
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchRuns();
  }, [id, fetchRuns]);

  const statusTags: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
    running: { bg: "#eff8ff", text: "#175cd3", border: "#b2ddff", icon: <Clock size={12} /> },
    waiting_reply: { bg: "#fffaeb", text: "#b54708", border: "#fedf89", icon: <AlertCircle size={12} /> },
    completed: { bg: "#ecfdf3", text: "#067647", border: "#abefc6", icon: <CheckCircle2 size={12} /> },
    failed: { bg: "#fef3f2", text: "#b42318", border: "#fecdca", icon: <XCircle size={12} /> },
    expired: { bg: "#f8fafc", text: "#475467", border: "#e2e8f0", icon: <Clock size={12} /> },
  };

  const getAuditEventClass = (event: string) => {
    const e = event.toLowerCase();
    if (e.includes("complete") || e.includes("success") || e.includes("sent")) return styles.auditEventSuccess;
    if (e.includes("fail") || e.includes("error")) return styles.auditEventError;
    if (e.includes("wait") || e.includes("warning")) return styles.auditEventWarn;
    if (e.includes("handoff") || e.includes("subflow") || e.includes("goto_flow")) return styles.auditEventFlow;
    return styles.auditEventInfo;
  };

  const renderAuditDetail = (log: AuditLog) => {
    const d = typeof log.detail === "string" ? (() => { try { return JSON.parse(log.detail); } catch { return log.detail; } })() : log.detail;
    if (!d || typeof d !== "object") return String(d ?? "");

    if (log.event === "flow_handoff") {
      return (
        <span style={{ color: "#4338ca", fontWeight: 600 }}>
          Handoff: &quot;{d.sourceFlowName || d.sourceFlowId}&quot; → &quot;{d.targetFlowName || d.targetFlowId}&quot;
        </span>
      );
    }
    if (log.event === "subflow_called") {
      return (
        <span style={{ color: "#4338ca", fontWeight: 600 }}>
          Call Sub-flow (depth {d.depth}): &quot;{d.sourceFlowName || d.sourceFlowId}&quot; → &quot;{d.targetFlowName || d.targetFlowId}&quot;
        </span>
      );
    }
    if (log.event === "subflow_returned") {
      return (
        <span style={{ color: "#067647", fontWeight: 600 }}>
          Return from Sub-flow: &quot;{d.sourceFlowName || d.sourceFlowId}&quot; → &quot;{d.targetFlowName || d.targetFlowId}&quot; (port: {d.returnPort || "completed"})
        </span>
      );
    }
    if (log.event === "subflow_depth_exceeded") {
      return (
        <span style={{ color: "#b42318", fontWeight: 600 }}>
          Subflow call depth (5) exceeded! Routed to error branch.
        </span>
      );
    }
    return JSON.stringify(d);
  };

  return (
    <div className={styles.container}>
      {/* Top Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href={`/workflow/${id}`} className={styles.backBtn} title="Back to Workflow Editor">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className={styles.title}>Workflow Execution Runs</h1>
            <p className={styles.subtitle}>
              Live customer session history, waiting replies, variable contexts, and step-by-step audit traces.
            </p>
          </div>
        </div>

        <button onClick={fetchRuns} className={styles.refreshBtn}>
          <RotateCcw size={14} /> Refresh
        </button>
      </div>

      {/* Runs Table */}
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr className={styles.tableHead}>
              <th>Run ID</th>
              <th>Customer Phone</th>
              <th>Status</th>
              <th>Version</th>
              <th>Current Step</th>
              <th>Steps</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "48px 16px", color: "#667085" }}>
                  <Spin size="small" /> <span style={{ marginLeft: "8px" }}>Loading execution runs...</span>
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "48px 16px", color: "#667085" }}>
                  No execution runs recorded yet for this workflow.
                </td>
              </tr>
            ) : (
              runs.map((r) => {
                const tagInfo = statusTags[r.status] || statusTags.completed;
                return (
                  <React.Fragment key={r.id}>
                    <tr className={styles.mainRow}>
                      <td className={styles.runIdCell}>
                        {r.id}
                      </td>
                      <td>
                        <span className={styles.phoneCell}>
                          <Phone size={13} className={styles.phoneIcon} />
                          +{r.customerPhone}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "3px 9px",
                            borderRadius: "9999px",
                            background: tagInfo.bg,
                            color: tagInfo.text,
                            border: `1px solid ${tagInfo.border}`,
                            fontSize: "11px",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.03em",
                          }}
                        >
                          {tagInfo.icon}
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className={styles.versionBadge}>v{r.workflowVersion}</span>
                      </td>
                      <td>
                        {r.currentNodeId ? (
                          <code className={styles.stepNodeBadge}>{r.currentNodeId}</code>
                        ) : (
                          <span className={styles.noneText}>(none)</span>
                        )}
                      </td>
                      <td className={styles.stepCountCell}>{r.stepCount}</td>
                      <td className={styles.timeCell}>
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                    </tr>
                    {/* Details: Variables & Audit Traces */}
                    <tr className={styles.detailsRow}>
                      <td colSpan={7}>
                        <div className={styles.detailsContent}>
                          {/* Variables */}
                          <div style={{ flex: 1, minWidth: "280px" }}>
                            <div className={styles.sectionHeader}>
                              Variables Context:
                            </div>
                            <pre className={styles.codeBox}>
                              {JSON.stringify(r.context, null, 2)}
                            </pre>
                          </div>

                          {/* Audit Logs */}
                          <div style={{ flex: 2, minWidth: "360px" }}>
                            <div className={styles.sectionHeader}>
                              Step Execution Audit Trail ({r.logs.length} events):
                            </div>
                            <div className={styles.auditBox}>
                              {r.logs.length === 0 ? (
                                <span className={styles.emptyText}>No step audit entries recorded.</span>
                              ) : (
                                r.logs.map((log) => (
                                  <div key={log.id} className={styles.auditItem}>
                                    <span className={styles.auditTime}>
                                      {new Date(log.createdAt).toLocaleTimeString()}
                                    </span>
                                    <span className={`${styles.auditEvent} ${getAuditEventClass(log.event)}`}>
                                      {log.event}
                                    </span>
                                    {log.nodeId && (
                                      <code className={styles.auditNodeId}>[{log.nodeId}]</code>
                                    )}
                                    <span className={styles.auditDetail}>
                                      {renderAuditDetail(log)}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
