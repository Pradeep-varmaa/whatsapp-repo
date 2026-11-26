"use client";

import React, { useState } from "react";
import { Table, Tag, Button, Tabs, Drawer, Input, Popconfirm, message } from "antd";
import { Webhook, Search, ShieldCheck, Plus, Globe, Trash2 } from "lucide-react";
import { WebhookEvent, CallbackDelivery } from "@/shared/types";
import { AddAllowlistModal } from "@/components/workflows/AddAllowlistModal";
import styles from "./webhooks.module.css";

export default function WebhooksPage() {
  const [activeTab, setActiveTab] = useState<string>("deliveries");
  const [deliveries, setDeliveries] = useState<CallbackDelivery[]>([]);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState<CallbackDelivery | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null);
  const [search, setSearch] = useState("");
  const [allowlist, setAllowlist] = useState<Array<{ id: string; host: string; project_id?: string | null; created_at?: string }>>([]);
  const [isAllowlistModalOpen, setIsAllowlistModalOpen] = useState(false);

  const loadAllowlist = () => {
    fetch("/api/webhook-allowlist")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setAllowlist(data.data);
        }
      })
      .catch(() => {});
  };

  const loadData = () => {
    loadAllowlist();
    fetch("/api/v1/webhooks?type=deliveries")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setDeliveries(data.data);
        }
      })
      .catch(() => {});

    fetch("/api/v1/webhooks?type=events")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setEvents(data.data);
        }
      })
      .catch(() => {});
  };

  React.useEffect(() => {
    loadData();
  }, []);

  const filteredDeliveries = deliveries.filter(
    (d) =>
      (d.targetUrl || "").toLowerCase().includes(search.toLowerCase()) ||
      (d.eventType || "").toLowerCase().includes(search.toLowerCase()) ||
      Boolean(d.projectName && d.projectName.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredEvents = events.filter(
    (e) =>
      (e.eventType || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.eventId || "").toLowerCase().includes(search.toLowerCase())
  );

  const deliveryColumns = [
    {
      title: "Event Type & Project",
      key: "event",
      render: (_: any, d: CallbackDelivery) => (
        <div>
          <div style={{ fontWeight: 600, color: "var(--wa-text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
            <Webhook size={14} color="#075E54" />
            <span style={{ fontFamily: "monospace", fontSize: 12 }}>{d.eventType}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>{d.projectName}</div>
        </div>
      ),
    },
    {
      title: "Target Endpoint",
      dataIndex: "targetUrl",
      key: "targetUrl",
      render: (url: string) => (
        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#8696A0", maxWidth: 280, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</span>
      ),
    },
    {
      title: "Status & Response",
      key: "status",
      render: (_: any, d: CallbackDelivery) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Tag
            color={d.status === "delivered" ? "success" : d.status === "pending" ? "warning" : "error"}
            style={{ fontSize: 10, fontFamily: "monospace", textTransform: "uppercase" }}
          >
            {d.status}
          </Tag>
          {d.httpStatusCode && (
            <span
              style={{
                fontSize: 12,
                fontFamily: "monospace",
                fontWeight: 700,
                color: d.httpStatusCode >= 200 && d.httpStatusCode < 300 ? "#25D366" : "#EF4444",
              }}
            >
              HTTP {d.httpStatusCode}
            </span>
          )}
        </div>
      ),
    },
    {
      title: "Retry Count",
      dataIndex: "attemptCount",
      key: "attemptCount",
      render: (attempts: number) => (
        <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--wa-text-primary)" }}>{attempts} attempt(s)</span>
      ),
    },
    {
      title: "Last Attempt",
      dataIndex: "lastAttemptAt",
      key: "lastAttemptAt",
      render: (time: string | null) => (
        <span style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>
          {time ? new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Queued"}
        </span>
      ),
    },
    {
      title: "Payload",
      key: "action",
      render: (_: any, d: CallbackDelivery) => (
        <Button
          size="small"
          type="text"
          style={{ color: "#075E54", fontWeight: 600 }}
          onClick={() => setSelectedDelivery(d)}
        >
          View Details
        </Button>
      ),
    },
  ];

  const eventColumns = [
    {
      title: "Event ID & Type",
      key: "id",
      render: (_: any, e: WebhookEvent) => (
        <div>
          <span style={{ fontWeight: 600, color: "var(--wa-text-primary)", fontFamily: "monospace", fontSize: 12 }}>{e.eventId}</span>
          <div style={{ fontSize: 11, color: "#075E54", fontFamily: "monospace" }}>{e.eventType}</div>
        </div>
      ),
    },
    {
      title: "Received Timestamp",
      dataIndex: "receivedAt",
      key: "receivedAt",
      render: (time: string) => <span style={{ fontSize: 12, color: "#8696A0" }}>{new Date(time).toLocaleString()}</span>,
    },
    {
      title: "Processing Status",
      dataIndex: "processingStatus",
      key: "processingStatus",
      render: (st: string) => (
        <Tag color="success" style={{ fontSize: 10, textTransform: "uppercase", fontFamily: "monospace" }}>
          {st}
        </Tag>
      ),
    },
    {
      title: "Raw Event",
      key: "action",
      render: (_: any, e: WebhookEvent) => (
        <Button
          size="small"
          type="text"
          style={{ color: "#25D366" }}
          onClick={() => setSelectedEvent(e)}
        >
          Inspect JSON
        </Button>
      ),
    },
  ];

  const allowlistColumns = [
    {
      title: "Allowed Hostname / Domain",
      dataIndex: "host",
      key: "host",
      render: (host: string) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Globe size={15} color="#0f9d7a" />
          <code style={{ fontSize: 12, fontWeight: 600, color: "var(--wa-text-primary)" }}>{host}</code>
        </div>
      ),
    },
    {
      title: "Scope",
      dataIndex: "project_id",
      key: "project_id",
      render: (pid: string | null) => (
        <Tag color={pid ? "blue" : "purple"} style={{ fontSize: 11 }}>
          {pid ? `Project: ${pid}` : "Global (All Projects)"}
        </Tag>
      ),
    },
    {
      title: "Security Status",
      key: "status",
      render: () => <Tag color="success" style={{ fontSize: 10, fontWeight: 600 }}>ALLOWED</Tag>,
    },
    {
      title: "Action",
      key: "action",
      width: 80,
      render: (_: any, r: any) => (
        <Popconfirm
          title="Revoke domain"
          description={`Remove "${r.host}" from allowlist?`}
          onConfirm={async () => {
            try {
              const res = await fetch(`/api/webhook-allowlist?id=${encodeURIComponent(r.id || r.host)}`, { method: "DELETE" });
              const json = await res.json();
              if (json.success) {
                message.success(`Removed "${r.host}" from allowlist`);
                loadAllowlist();
              } else {
                message.error(json.error?.message || "Failed to remove host");
              }
            } catch {
              message.error("Failed to remove host");
            }
          }}
          okText="Remove"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
        >
          <Button size="small" type="text" danger icon={<Trash2 size={13} />} />
        </Popconfirm>
      ),
    },
  ];

  const filteredAllowlist = allowlist.filter((item) =>
    (item.host || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h2 className={styles.title}>Webhook Diagnostics & Deliveries</h2>
        <p className={styles.subtitle}>
          Inspect incoming Meta events, callback forwarding queues, and outbound domain allowlists.
        </p>
      </div>

      {/* Tabs */}
      <div className={`glass-panel ${styles.panel}`}>
        <div className={styles.panelTop}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              { key: "deliveries", label: "Project Callback Forwarding" },
              { key: "events", label: "Incoming Meta Webhook Log" },
              { key: "allowlist", label: "Outbound Destination Allowlist" },
            ]}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {activeTab === "allowlist" && (
              <Button
                type="primary"
                icon={<Plus size={14} />}
                onClick={() => setIsAllowlistModalOpen(true)}
                style={{ background: "#0f9d7a", borderColor: "#0f9d7a", fontWeight: 600 }}
              >
                + Add Domain
              </Button>
            )}
            <Input
              prefix={<Search size={15} style={{ color: "#8696A0", marginRight: 6 }} />}
              placeholder={activeTab === "allowlist" ? "Search domains..." : "Search webhooks..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`glass-input ${styles.searchBox}`}
            />
          </div>
        </div>

        {activeTab === "deliveries" ? (
          <Table columns={deliveryColumns} dataSource={filteredDeliveries} rowKey="deliveryId" scroll={{ x: 750 }} pagination={{ pageSize: 8 }} />
        ) : activeTab === "events" ? (
          <Table columns={eventColumns} dataSource={filteredEvents} rowKey="eventId" scroll={{ x: 650 }} pagination={{ pageSize: 8 }} />
        ) : (
          <Table columns={allowlistColumns} dataSource={filteredAllowlist} rowKey="id" pagination={{ pageSize: 8 }} />
        )}
      </div>

      {/* Add Allowlist Modal */}
      <AddAllowlistModal
        open={isAllowlistModalOpen}
        onClose={() => setIsAllowlistModalOpen(false)}
        onSuccess={() => loadAllowlist()}
      />

      {/* Callback Delivery Details Drawer */}
      <Drawer
        title="Callback Forwarding Details"
        placement="right"
        size="large"
        onClose={() => setSelectedDelivery(null)}
        open={Boolean(selectedDelivery)}
      >
        {selectedDelivery && (
          <div className={styles.drawerContent}>
            <div className={styles.drawerRow}>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#8696A0" }}>Delivery ID: {selectedDelivery.deliveryId}</span>
              <Tag color={selectedDelivery.status === "delivered" ? "success" : "warning"}>
                {selectedDelivery.status.toUpperCase()}
              </Tag>
            </div>

            <div className={styles.detailCard}>
              <div>
                <span style={{ color: "var(--wa-text-secondary)" }}>Destination Endpoint:</span>
                <div style={{ fontFamily: "monospace", color: "var(--wa-text-primary)", wordBreak: "break-all", marginTop: 2 }}>{selectedDelivery.targetUrl}</div>
              </div>
              <div className={styles.detailItem}>
                <span style={{ color: "var(--wa-text-secondary)" }}>HTTP Status:</span>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--wa-text-primary)" }}>HTTP {selectedDelivery.httpStatusCode || "N/A"}</span>
              </div>
              <div className={styles.detailItem}>
                <span style={{ color: "var(--wa-text-secondary)" }}>Delivery Attempts:</span>
                <span style={{ fontFamily: "monospace", color: "var(--wa-text-primary)" }}>{selectedDelivery.attemptCount}</span>
              </div>
            </div>

            <div>
              <span style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>Payload Dispatched:</span>
              <pre className={styles.codeArea} style={{ marginTop: 4 }}>
                {JSON.stringify(selectedDelivery.payload, null, 2)}
              </pre>
            </div>

            {selectedDelivery.responseBody && (
              <div>
                <span style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>Client Response Body:</span>
                <pre className={styles.codeArea} style={{ marginTop: 4, maxHeight: 160 }}>
                  {selectedDelivery.responseBody}
                </pre>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Raw Event Drawer */}
      <Drawer
        title="Incoming Meta Event"
        placement="right"
        size="large"
        onClose={() => setSelectedEvent(null)}
        open={Boolean(selectedEvent)}
      >
        {selectedEvent && (
          <div className={styles.drawerContent}>
            <div className={styles.drawerRow}>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#8696A0" }}>Event ID: {selectedEvent.eventId}</span>
              <Tag color="success">PROCESSED</Tag>
            </div>
            <div>
              <span style={{ fontSize: 12, color: "#8696A0" }}>Raw Meta Webhook JSON:</span>
              <pre className={styles.codeArea} style={{ marginTop: 4, maxHeight: 380 }}>
                {JSON.stringify(selectedEvent.payload, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
