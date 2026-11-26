"use client";

import React, { useState, useEffect } from "react";
import { Modal, Input, Button, Tag, Table, message, Popconfirm, Tabs } from "antd";
import {
  ShieldCheck,
  Plus,
  Trash2,
  Globe,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RotateCw,
} from "lucide-react";

interface AllowlistItem {
  id: string;
  host: string;
  project_id?: string | null;
  created_by?: string | null;
  created_at?: string;
}

interface AddAllowlistModalProps {
  open: boolean;
  onClose: () => void;
  initialHost?: string;
  onSuccess?: (addedHost: string) => void;
}

export function AddAllowlistModal({
  open,
  onClose,
  initialHost = "",
  onSuccess,
}: AddAllowlistModalProps) {
  const [activeTab, setActiveTab] = useState<string>("add");
  const [hostInput, setHostInput] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [allowlist, setAllowlist] = useState<AllowlistItem[]>([]);

  // Clean host helper
  const cleanHost = (val: string): string => {
    let clean = val.toLowerCase().trim();
    if (clean.includes("://")) {
      try {
        clean = new URL(clean).hostname.toLowerCase().trim();
      } catch {
        // ignore
      }
    }
    clean = clean.split("/")[0].split(":")[0].trim();
    return clean;
  };

  const detectedDomain = cleanHost(hostInput);

  useEffect(() => {
    if (open) {
      if (initialHost) {
        setHostInput(cleanHost(initialHost));
      }
      loadAllowlist();
    }
  }, [open, initialHost]);

  const loadAllowlist = async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/webhook-allowlist");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setAllowlist(json.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  };

  const handleAdd = async () => {
    const target = detectedDomain;
    if (!target) {
      message.error("Please enter a valid domain name (e.g. varmatec.in)");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/webhook-allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: target }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        message.success(data.message || `Host "${target}" added to Webhook Allowlist!`);
        setHostInput("");
        await loadAllowlist();
        if (onSuccess) {
          onSuccess(target);
        }
        onClose();
      } else {
        message.error(data.error?.message || "Failed to add host to allowlist");
      }
    } catch (err: any) {
      message.error(err.message || "Failed to add domain to allowlist");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, host: string) => {
    try {
      const res = await fetch(`/api/webhook-allowlist?id=${encodeURIComponent(id || host)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        message.success(`Removed "${host}" from allowlist`);
        loadAllowlist();
      } else {
        message.error(data.error?.message || "Failed to remove domain");
      }
    } catch (err: any) {
      message.error(err.message || "Failed to delete domain");
    }
  };

  const columns = [
    {
      title: "Hostname / Domain",
      dataIndex: "host",
      key: "host",
      render: (host: string) => (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Globe size={14} color="#0f9d7a" />
          <code style={{ fontSize: "12px", fontWeight: 600, color: "#0f766e" }}>{host}</code>
        </div>
      ),
    },
    {
      title: "Scope",
      dataIndex: "project_id",
      key: "project_id",
      render: (pid: string | null) => (
        <Tag color={pid ? "blue" : "purple"} style={{ fontSize: "11px" }}>
          {pid ? `Project: ${pid}` : "Global (All Projects)"}
        </Tag>
      ),
    },
    {
      title: "Action",
      key: "action",
      width: 70,
      render: (_: any, record: AllowlistItem) => (
        <Popconfirm
          title="Remove host"
          description={`Are you sure you want to remove "${record.host}" from allowlist?`}
          onConfirm={() => handleDelete(record.id, record.host)}
          okText="Remove"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
        >
          <Button
            type="text"
            danger
            size="small"
            icon={<Trash2 size={13} />}
          />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnClose
      title={
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "16px", fontWeight: 700, color: "#101828" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#ecfdf5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShieldCheck size={18} color="#0f9d7a" />
          </div>
          <span>Webhook Destination Allowlist</span>
        </div>
      }
    >
      <div style={{ marginTop: "12px" }}>
        <p style={{ fontSize: "12.5px", color: "#475467", lineHeight: "1.5", margin: "0 0 16px 0" }}>
          For security (SSRF prevention), workflow API requests and outbound dispatches are restricted to approved domains.
        </p>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "add",
              label: (
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Plus size={14} /> Add Domain
                </span>
              ),
              children: (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", paddingTop: "8px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "#344054", display: "block", marginBottom: "6px" }}>
                      Target Hostname or API URL:
                    </label>
                    <Input
                      placeholder="e.g. varmatec.in or https://varmatec.in/api/v1"
                      value={hostInput}
                      onChange={(e) => setHostInput(e.target.value)}
                      onPressEnter={handleAdd}
                      size="large"
                      prefix={<Globe size={15} color="#98a2b3" style={{ marginRight: 4 }} />}
                      style={{ borderRadius: "8px" }}
                    />
                    {hostInput && detectedDomain && (
                      <div style={{ marginTop: "8px", fontSize: "11.5px", color: "#0f766e", display: "flex", alignItems: "center", gap: "6px" }}>
                        <CheckCircle2 size={13} color="#0f9d7a" />
                        <span>Domain to allowlist: <strong>{detectedDomain}</strong></span>
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      fontSize: "11.5px",
                      color: "#64748b",
                      lineHeight: "1.4",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "#334155", marginBottom: "3px" }}>
                      🛡️ Security Guardrails
                    </div>
                    Private/loopback hosts (<code>localhost</code>, <code>127.0.0.1</code>, <code>10.x</code>, <code>192.168.x</code>) are strictly prohibited to protect your internal infrastructure.
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                    <Button onClick={onClose}>
                      Cancel
                    </Button>
                    <Button
                      type="primary"
                      onClick={handleAdd}
                      loading={submitting}
                      disabled={!detectedDomain}
                      style={{
                        background: "linear-gradient(135deg, #0f9d7a, #0d8a6b)",
                        borderColor: "#0f9d7a",
                        fontWeight: 600,
                        padding: "0 20px",
                      }}
                      icon={<Plus size={15} />}
                    >
                      Add & Allowlist Domain
                    </Button>
                  </div>
                </div>
              ),
            },
            {
              key: "list",
              label: (
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Globe size={14} /> View All ({allowlist.length})
                </span>
              ),
              children: (
                <div style={{ paddingTop: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
                    <Button
                      size="small"
                      type="text"
                      icon={<RotateCw size={12} />}
                      onClick={loadAllowlist}
                      loading={loadingList}
                    >
                      Refresh
                    </Button>
                  </div>
                  <Table
                    dataSource={allowlist}
                    columns={columns}
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 5 }}
                    loading={loadingList}
                    locale={{
                      emptyText: (
                        <div style={{ padding: "20px 0", color: "#98a2b3" }}>
                          No domains currently allowlisted.
                        </div>
                      ),
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      </div>
    </Modal>
  );
}
