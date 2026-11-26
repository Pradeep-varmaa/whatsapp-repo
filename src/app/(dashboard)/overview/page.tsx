"use client";

import React, { useEffect, useState } from "react";
import { Send, PhoneCall, AppWindow, ArrowDownLeft, ArrowUpRight, Webhook, ShieldAlert, FolderGit2, CheckCircle2, Trash2 } from "lucide-react";
import { Modal, message } from "antd";
import Link from "next/link";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { RequestLog } from "@/shared/types";
import styles from "./overview.module.css";

interface EnrichedProject {
  projectId: string;
  name: string;
  slug: string;
  wabaId: string;
  status: string;
  phoneNumbersCount: number;
  deliveryCount: number;
  messageCount: number;
  assignedNumbers: Array<{
    phoneNumberId: string;
    displayPhoneNumber: string;
    verifiedName: string;
    status: string;
    qualityRating: string;
  }>;
}

interface OverviewData {
  kpis: {
    serverRequests: number;
    userRequests: number;
    inboundWebhookMessages: number;
    activePhoneNumbers: number;
    subscribedApps: number;
    totalDeliveries: number;
    failedRequests?: number;
  };
  deliveryBreakdown: Array<{ name: string; value: number; color: string }>;
  projectActivity: Array<{ name: string; slug: string; phoneCount: number; deliveryCount: number }>;
  projects: EnrichedProject[];
  recentRequests: RequestLog[];
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData>({
    kpis: {
      serverRequests: 0,
      userRequests: 0,
      inboundWebhookMessages: 0,
      activePhoneNumbers: 0,
      subscribedApps: 0,
      totalDeliveries: 0,
      failedRequests: 0,
    },
    deliveryBreakdown: [],
    projectActivity: [],
    projects: [],
    recentRequests: [],
  });

  const loadOverview = () => {
    fetch("/api/v1/overview")
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          setData({
            kpis: {
              serverRequests: res.data.kpis?.serverRequests ?? 0,
              userRequests: res.data.kpis?.userRequests ?? 0,
              inboundWebhookMessages: res.data.kpis?.inboundWebhookMessages ?? res.data.kpis?.userRequests ?? 0,
              activePhoneNumbers: res.data.kpis?.activePhoneNumbers ?? 0,
              subscribedApps: res.data.kpis?.subscribedApps ?? 0,
              totalDeliveries: res.data.kpis?.totalDeliveries ?? 0,
              failedRequests: res.data.kpis?.failedRequests ?? 0,
            },
            deliveryBreakdown: res.data.deliveryBreakdown || [],
            projectActivity: res.data.projectActivity || [],
            projects: res.data.projects || [],
            recentRequests: res.data.recentRequests || [],
          });
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const handleDeleteProject = (proj: EnrichedProject) => {
    Modal.confirm({
      title: "Remove Project?",
      icon: <Trash2 size={22} color="#dc2626" style={{ marginRight: 8 }} />,
      content: (
        <div>
          <p>
            Are you sure you want to remove <strong>{proj.name}</strong> ({proj.projectId})?
          </p>
          <p style={{ fontSize: 12, color: "#6b7280" }}>
            This performs a soft delete (status set to archived). The project will be removed from overview and active routing.
          </p>
        </div>
      ),
      okText: "Yes, Remove Project",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const res = await fetch(`/api/projects?projectId=${encodeURIComponent(proj.projectId)}`, {
            method: "DELETE",
          });
          const json = await res.json();
          if (json.success) {
            message.success(`Project "${proj.name}" removed successfully.`);
            loadOverview();
          } else {
            message.error(json.error?.message || "Failed to remove project.");
          }
        } catch (err: any) {
          message.error(err.message || "Failed to remove project.");
        }
      },
    });
  };

  const kpis = [
    {
      title: "Active Phone Numbers",
      value: String(data.kpis.activePhoneNumbers),
      description: "Provisioned Meta sender numbers",
      href: "/phone-numbers",
      icon: <PhoneCall size={16} color="var(--brand)" />,
    },
    {
      title: "Subscribed Apps",
      value: String(data.kpis.subscribedApps),
      description: "Connected Meta Apps for webhooks",
      href: "/subscribed-apps",
      icon: <AppWindow size={16} color="#0284C7" />,
    },
    {
      title: "Inbound Webhook Messages",
      value: String(data.kpis.inboundWebhookMessages),
      description: "Incoming customer messages from Meta",
      href: "/projects",
      icon: <ArrowDownLeft size={16} color="var(--violet)" />,
    },
    {
      title: "Server Dispatches",
      value: String(data.kpis.serverRequests),
      description: "Outbound dispatches to WhatsApp",
      href: "/demo",
      icon: <ArrowUpRight size={16} color="#2563EB" />,
    },
    {
      title: "Webhook Deliveries",
      value: String(data.kpis.totalDeliveries),
      description: "Outbound callbacks forwarded",
      href: "/webhooks",
      icon: <Webhook size={16} color="#16A34A" />,
    },
    {
      title: "Failed Requests",
      value: String(data.kpis.failedRequests ?? 0),
      description: "Security drops & validation failures",
      href: "/audit-logs",
      icon: <ShieldAlert size={16} color="#EF4444" />,
    },
  ];

  const totalTraffic = data.deliveryBreakdown.reduce((sum, item) => sum + (item.value || 0), 0);

  return (
    <div className={styles.container}>
      {/* Hero Banner */}
      <div className={`glass-strong ${styles.banner}`}>
        <div className={styles.bannerLeft}>
          <div className={styles.bannerHeading}>
            <h2 className={styles.bannerTitle}>Dynamic WhatsApp Engine</h2>
          </div>
          <p className={styles.bannerDesc}>
            Multi-app management, phone number assignments, and live Meta Graph API message routing.
          </p>
        </div>
        <div className={styles.bannerActions}>
          <Link href="/projects" className="btn-primary">
            <Send size={14} />
            <span>Dispatcher & Requests</span>
          </Link>
          <Link href="/phone-numbers" className="btn-secondary">
            <span>Phone Numbers</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className={styles.kpiGrid}>
        {kpis.map((kpi, idx) => (
          <Link key={idx} href={kpi.href} className={styles.kpiLink}>
            <div className={`glass ${styles.kpiCard}`}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className={styles.kpiTitle}>{kpi.title}</div>
                {kpi.icon}
              </div>
              <div className={styles.kpiValue}>{kpi.value}</div>
              <div className={styles.kpiDesc}>{kpi.description}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Projects & Associated WhatsApp Phone Numbers Section */}
      <div className={`glass ${styles.tableCard}`}>
        <div className={styles.tableHeader}>
          <div>
            <h3 className={styles.tableTitle}>Projects & Associated WhatsApp Numbers (WABA)</h3>
            <p className={styles.tableSubtitle}>
              Projects under this WhatsApp account mapped to their designated sender phone numbers
            </p>
          </div>
          <Link href="/phone-numbers" className="btn-secondary" style={{ padding: "6px 14px", fontSize: 12 }}>
            Manage Number Mappings
          </Link>
        </div>

        {data.projects.length === 0 ? (
          <div className={styles.emptyRequests}>
            No projects registered under this WABA. Connect a project to assign sender numbers.
          </div>
        ) : (
          <div className={styles.projectGrid}>
            {data.projects.map((proj) => (
              <div key={proj.projectId} className={styles.projectCard}>
                <div className={styles.projectCardHeader}>
                  <div>
                    <h4 className={styles.projectName}>{proj.name}</h4>
                    <span className={styles.projectSlug}>{proj.slug}</span>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: "rgba(16, 185, 129, 0.15)",
                      color: "#10B981",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                    }}
                  >
                    {proj.status}
                  </span>
                </div>

                <div className={styles.phoneList}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 2 }}>
                    ASSIGNED PHONE NUMBERS:
                  </div>
                  {proj.assignedNumbers && proj.assignedNumbers.length > 0 ? (
                    proj.assignedNumbers.map((phone) => (
                      <div key={phone.phoneNumberId} className={styles.phoneBadge}>
                        <div className={styles.phoneBadgeLeft}>
                          <PhoneCall size={12} color="var(--brand)" />
                          <span>{phone.displayPhoneNumber}</span>
                          <span style={{ fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>
                            ({phone.verifiedName})
                          </span>
                        </div>
                        <span style={{ fontSize: 10, color: "#10B981", fontWeight: 600 }}>
                          {phone.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
                      No phone number currently assigned to this project
                    </div>
                  )}
                </div>

                <div className={styles.projectStatsRow}>
                  <span>Messages: <strong>{proj.messageCount}</strong></span>
                  <span>Webhook Dispatches: <strong>{proj.deliveryCount}</strong></span>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Link href="/projects" style={{ color: "var(--brand)", fontWeight: 600 }}>
                      Open Dispatcher →
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(proj)}
                      title="Remove Project (Soft Delete)"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#ef4444",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      <Trash2 size={13} />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Traffic Charts: Side-by-side */}
      <div className={styles.chartsGrid}>
        {/* Project Activity Bar Chart */}
        <div className={`glass ${styles.chartCard}`}>
          <div className={styles.chartHeader}>
            <h3 className={styles.chartTitle}>Project Deliveries</h3>
          </div>
          <div className={styles.chartBody}>
            {data.projectActivity.length === 0 || totalTraffic === 0 ? (
              <div className={styles.dashedPlaceholder}>
                <span>No traffic yet</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.projectActivity} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                    interval={0}
                    angle={-10}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--glass-strong)",
                      border: "1px solid var(--stroke)",
                      borderRadius: "14px",
                      boxShadow: "var(--shadow)",
                      color: "var(--text)",
                    }}
                  />
                  <Bar dataKey="deliveryCount" name="Count" fill="var(--brand2)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Traffic Share Pie Chart */}
        <div className={`glass ${styles.chartCard}`}>
          <div className={styles.chartHeader}>
            <h3 className={styles.chartTitle}>Traffic Share</h3>
          </div>
          <div className={styles.chartBody}>
            {data.deliveryBreakdown.length === 0 || totalTraffic === 0 ? (
              <div className={styles.donutEmptyContainer}>
                <svg width="200" height="200" viewBox="0 0 200 200" className={styles.donutSvg}>
                  <circle
                    cx="100"
                    cy="100"
                    r="75"
                    fill="none"
                    stroke="var(--stroke)"
                    strokeWidth="24"
                    strokeDasharray="6 4"
                    opacity={0.6}
                  />
                </svg>
                <div className={styles.donutCenterLabel}>
                  <span>No data</span>
                </div>
              </div>
            ) : (
              <div className={styles.donutChartContainer}>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={data.deliveryBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {data.deliveryBreakdown.map((entry, index) => {
                        const isViolet = entry.name.toLowerCase().includes("inbound") || entry.name.toLowerCase().includes("user");
                        const sliceColor = isViolet ? "var(--violet)" : (entry.color || "var(--brand2)");
                        return <Cell key={`cell-${index}`} fill={sliceColor} />;
                      })}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--glass-strong)",
                        border: "1px solid var(--stroke)",
                        borderRadius: "14px",
                        boxShadow: "var(--shadow)",
                        color: "var(--text)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Dynamic Requests Stream */}
      <div className={`glass ${styles.tableCard}`}>
        <div className={styles.tableHeader}>
          <div>
            <h3 className={styles.tableTitle}>Recent Dynamic Requests</h3>
            <p className={styles.tableSubtitle}>Latest requests received from server and user replies</p>
          </div>
          <Link href="/projects" className="btn-secondary" style={{ padding: "6px 14px", fontSize: 12 }}>
            View All in Dispatcher
          </Link>
        </div>

        <div className={styles.requestsList}>
          {data.recentRequests.length === 0 ? (
            <div className={styles.emptyRequests}>
              No requests received yet. Incoming WhatsApp webhooks and outbound server dispatches will appear here automatically.
            </div>
          ) : (
            data.recentRequests.map((req) => {
              const isOutbound = req.source === "server";
              return (
                <div key={req.requestId} className={styles.requestItem}>
                  <div className={styles.requestMeta}>
                    <span className={isOutbound ? styles.outboundPill : styles.inboundPill}>
                      {isOutbound ? "Server → WhatsApp" : "Inbound → Webhook"}
                    </span>
                    <span className={styles.monoText}>{req.from}</span>
                    <span className={styles.arrowText}>→</span>
                    <span className={styles.monoSecondary}>{req.to}</span>
                  </div>

                  <div className={styles.messageContent}>
                    &ldquo;{req.message}&rdquo;
                  </div>

                  <div className={styles.requestStatusGroup}>
                    <span className={styles.timestampText}>
                      {new Date(req.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className={req.status === "dispatched" || req.status === "received" ? styles.statusSuccess : styles.statusDefault}>
                      {req.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
