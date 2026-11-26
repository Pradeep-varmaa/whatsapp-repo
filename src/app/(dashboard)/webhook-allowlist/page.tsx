"use client";

import React, { useState, useEffect } from "react";
import { Table, Button, Input, Tag, Popconfirm, message, Tooltip, Empty } from "antd";
import {
  ShieldCheck,
  Plus,
  Trash2,
  Globe,
  Search,
  RotateCw,
  Copy,
  Check,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { AddAllowlistModal } from "@/components/workflows/AddAllowlistModal";
import styles from "./webhook-allowlist.module.css";

interface AllowlistItem {
  id: string;
  host: string;
  project_id?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export default function WebhookAllowlistPage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [allowlist, setAllowlist] = useState<AllowlistItem[]>([]);
  const [search, setSearch] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [copiedHost, setCopiedHost] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/webhook-allowlist");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setAllowlist(json.data);
      } else {
        message.error(json.error?.message || "Failed to load allowlist");
      }
    } catch (err: any) {
      message.error(err.message || "Failed to fetch allowlist");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (id: string, host: string) => {
    try {
      const res = await fetch(`/api/webhook-allowlist?id=${encodeURIComponent(id || host)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        message.success(`Removed "${host}" from allowlist`);
        loadData();
      } else {
        message.error(data.error?.message || "Failed to delete host");
      }
    } catch (err: any) {
      message.error(err.message || "Network error deleting host");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHost(text);
    message.success(`Copied ${text} to clipboard`);
    setTimeout(() => setCopiedHost(null), 2000);
  };

  const filteredItems = allowlist.filter((item) =>
    (item.host || "").toLowerCase().includes(search.toLowerCase()) ||
    Boolean(item.project_id && item.project_id.toLowerCase().includes(search.toLowerCase()))
  );

  const columns = [
    {
      title: "Allowed Hostname / Domain",
      dataIndex: "host",
      key: "host",
      render: (host: string) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              background: "#ecfdf5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #d1fae5",
            }}
          >
            <Globe size={15} color="#0f9d7a" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 600, color: "var(--wa-text-primary)", fontFamily: "monospace", fontSize: 13 }}>
                {host}
              </span>
              <Tooltip title="Copy domain">
                <button
                  type="button"
                  onClick={() => copyToClipboard(host)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 2,
                    color: copiedHost === host ? "#10b981" : "#9ca3af",
                  }}
                >
                  {copiedHost === host ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </Tooltip>
            </div>
            <div style={{ fontSize: 11, color: "var(--wa-text-secondary)" }}>
              Permitted for HTTP &amp; HTTPS requests
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Project Scope",
      dataIndex: "project_id",
      key: "project_id",
      render: (pid: string | null) => (
        <Tag
          color={pid ? "blue" : "purple"}
          style={{ fontSize: 11, fontWeight: 500, borderRadius: 4 }}
        >
          {pid ? `Project: ${pid}` : "Global (All Projects)"}
        </Tag>
      ),
    },
    {
      title: "Security Status",
      key: "status",
      render: () => (
        <Tag color="success" style={{ fontSize: 11, fontWeight: 600, borderRadius: 4 }}>
          ✓ ALLOWED
        </Tag>
      ),
    },
    {
      title: "Added Timestamp",
      dataIndex: "created_at",
      key: "created_at",
      render: (time: string | null) => (
        <span style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>
          {time ? new Date(time).toLocaleString() : "System Initialized"}
        </span>
      ),
    },
    {
      title: "Action",
      key: "action",
      width: 90,
      render: (_: any, record: AllowlistItem) => (
        <Popconfirm
          title="Remove domain"
          description={`Revoke allowlist permission for "${record.host}"? API calls to this domain will be blocked.`}
          onConfirm={() => handleDelete(record.id, record.host)}
          okText="Revoke"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
        >
          <Button
            size="small"
            type="text"
            danger
            icon={<Trash2 size={14} />}
            style={{ fontWeight: 500 }}
          >
            Remove
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 className={styles.title} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={22} color="#0f9d7a" />
              Webhook &amp; API Destination Allowlist
            </h2>
            <p className={styles.subtitle}>
              Manage permitted external domains for Workflow API Request nodes and automated outbound webhook dispatches.
            </p>
          </div>
          <Button
            type="primary"
            icon={<Plus size={15} />}
            onClick={() => setIsModalOpen(true)}
            style={{
              background: "linear-gradient(135deg, #0f9d7a, #0d8a6b)",
              borderColor: "#0f9d7a",
              fontWeight: 600,
              height: 38,
              padding: "0 18px",
              borderRadius: 8,
              boxShadow: "0 2px 8px rgba(15, 157, 122, 0.25)",
            }}
          >
            + Add Domain
          </Button>
        </div>
      </div>

      {/* Security Info Card */}
      <div
        style={{
          padding: "14px 18px",
          borderRadius: "12px",
          background: "rgba(15, 157, 122, 0.05)",
          border: "1px solid rgba(15, 157, 122, 0.2)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <ShieldAlert size={20} color="#0f9d7a" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: "12.5px", color: "var(--wa-text-primary)", lineHeight: "1.4" }}>
          <strong>SSRF Protection Active:</strong> For security reasons, live workflow executions and test dispatches reject all outbound requests unless their destination hostname is explicitly registered in this allowlist.
        </div>
      </div>

      {/* Panel */}
      <div className={`glass-panel ${styles.panel}`}>
        <div className={styles.panelTop}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--wa-text-primary)" }}>
              Registered Domains ({allowlist.length})
            </span>
            <Button
              size="small"
              type="text"
              icon={<RotateCw size={13} />}
              onClick={loadData}
              loading={loading}
            >
              Refresh
            </Button>
          </div>
          <Input
            placeholder="Search allowlisted domains..."
            prefix={<Search size={14} color="#8696A0" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchBox}
            allowClear
          />
        </div>

        <Table
          dataSource={filteredItems}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div>
                    <p style={{ margin: 0, fontWeight: 500, color: "var(--wa-text-primary)" }}>
                      No domains in allowlist yet
                    </p>
                    <p style={{ margin: "4px 0 12px 0", fontSize: 12, color: "var(--wa-text-secondary)" }}>
                      Add your backend or API domains (e.g. varmatec.in) so workflows can query them.
                    </p>
                    <Button
                      type="primary"
                      icon={<Plus size={14} />}
                      onClick={() => setIsModalOpen(true)}
                      style={{ background: "#0f9d7a", borderColor: "#0f9d7a" }}
                    >
                      Add First Domain
                    </Button>
                  </div>
                }
              />
            ),
          }}
        />
      </div>

      {/* Add Domain Modal */}
      <AddAllowlistModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => loadData()}
      />
    </div>
  );
}
