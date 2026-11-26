"use client";

import React, { useState, useEffect } from "react";
import { Table, Button, Input, Tag, Modal, Form, Select, message, Tooltip } from "antd";
import {
  KeyRound,
  Plus,
  Trash2,
  Copy,
  Check,
  ShieldAlert,
  RotateCw,
  Terminal,
  Pencil,
} from "lucide-react";
import { normalizePhoneE164, isValidE164 } from "@/shared/utils/phone";
import styles from "./api-keys.module.css";

interface ApiKeyDisplayItem {
  id: string;
  name: string;
  keyPrefix: string;
  phoneNumberId: string;
  projectId?: string | null;
  allowedRecipients?: string[] | null;
  scopes: string[];
  rateLimitPerMinute: number;
  status: "active" | "revoked" | "expired" | string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

interface PhoneNumberOption {
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
}

/**
 * Reusable Chips Input for Allowed Recipients
 * Validates each number as standard E.164 and displays formatted chips.
 */
function RecipientChipsInput({
  recipients,
  onChange,
}: {
  recipients: string[];
  onChange: (newList: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    const raw = inputValue.trim();
    if (!raw) return;

    const normalized = normalizePhoneE164(raw);
    if (!isValidE164(normalized)) {
      message.error(
        `Invalid E.164 phone number: "${raw}". Must include country code (e.g. +15551234567 or +919014683627).`
      );
      return;
    }

    if (recipients.includes(normalized)) {
      message.warning(`Number ${normalized} is already in the allowed list.`);
      setInputValue("");
      return;
    }

    onChange([...recipients, normalized]);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleRemove = (phoneToRemove: string) => {
    onChange(recipients.filter((p) => p !== phoneToRemove));
  };

  return (
    <div>
      <div className={styles.chipsContainer}>
        {recipients.map((phone) => (
          <Tag
            key={phone}
            closable
            onClose={(e) => {
              e.preventDefault();
              handleRemove(phone);
            }}
            style={{
              fontFamily: "monospace",
              fontSize: 12,
              padding: "2px 8px",
              borderRadius: 6,
              background: "rgba(15, 157, 122, 0.15)",
              border: "1px solid var(--brand)",
              color: "var(--text)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {phone}
          </Tag>
        ))}
        <input
          className={styles.chipInput}
          placeholder={
            recipients.length === 0
              ? "Type phone number (e.g. +91 90146 83627) & press Enter..."
              : "Add another recipient & press Enter..."
          }
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {inputValue.trim().length > 0 && (
          <button type="button" className={styles.chipAddBtn} onClick={handleAdd}>
            Add
          </button>
        )}
      </div>
      <div className={styles.chipHint}>Leave empty to allow any number</div>
    </div>
  );
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyDisplayItem[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberOption[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKeyDisplayItem | null>(null);
  const [createChips, setCreateChips] = useState<string[]>([]);
  const [editChips, setEditChips] = useState<string[]>([]);

  const [newlyCreatedKey, setNewlyCreatedKey] = useState<{
    rawKey: string;
    keyPrefix: string;
    name: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const loadData = () => {
    setLoading(true);
    fetch("/api/api-keys")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setKeys(data.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Fetch phone numbers for dropdown
    fetch("/api/v1/phone-numbers")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          const options = (data.data || []).map((p: any) => ({
            phoneNumberId: p.phoneNumberId || p.id,
            displayPhoneNumber: p.displayPhoneNumber || p.display_phone_number || p.phoneNumberId,
            verifiedName: p.verifiedName || p.verified_name || "Sender Number",
          }));
          setPhoneNumbers(options);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (values: any) => {
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          phoneNumberId: values.phoneNumberId,
          projectId: values.projectId || null,
          allowedRecipients: createChips.length > 0 ? createChips : null,
          rateLimitPerMinute: Number(values.rateLimitPerMinute || 60),
          expiresAt: values.expiresAt || null,
        }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        message.success("API key generated successfully!");
        setNewlyCreatedKey({
          rawKey: data.data.rawKey,
          keyPrefix: data.data.keyPrefix,
          name: data.data.name,
        });
        setIsCreateModalOpen(false);
        createForm.resetFields();
        setCreateChips([]);
        loadData();
      } else {
        message.error(data.error?.message || "Failed to generate key");
      }
    } catch (err: any) {
      message.error(err.message || "Failed to create API key");
    }
  };

  const handleOpenEdit = (keyItem: ApiKeyDisplayItem) => {
    setEditingKey(keyItem);
    setEditChips(keyItem.allowedRecipients ? [...keyItem.allowedRecipients] : []);
    editForm.setFieldsValue({
      name: keyItem.name,
      rateLimitPerMinute: keyItem.rateLimitPerMinute,
      expiresAt: keyItem.expiresAt ? keyItem.expiresAt.slice(0, 10) : undefined,
    });
  };

  const handleUpdate = async (values: any) => {
    if (!editingKey) return;
    try {
      const res = await fetch(`/api/api-keys/${editingKey.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          allowedRecipients: editChips.length > 0 ? editChips : null,
          rateLimitPerMinute: Number(values.rateLimitPerMinute),
          expiresAt: values.expiresAt || null,
        }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        message.success("API key updated successfully!");
        setEditingKey(null);
        editForm.resetFields();
        setEditChips([]);
        loadData();
      } else {
        message.error(data.error?.message || "Failed to update API key");
      }
    } catch (err: any) {
      message.error(err.message || "Failed to update API key");
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      const res = await fetch(`/api/api-keys/${id}/revoke`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setKeys((prev) =>
          prev.map((k) => (k.id === id ? { ...k, status: "revoked" } : k))
        );
        message.success("API Key revoked");
      } else {
        message.error(data.error?.message || "Failed to revoke key");
      }
    } catch {
      message.error("Failed to revoke key");
    }
  };

  const handleRotate = async (id: string) => {
    try {
      const res = await fetch(`/api/api-keys/${id}/rotate`, { method: "POST" });
      const data = await res.json();
      if (data.success && data.data) {
        message.success("API Key rotated! Save the new secret.");
        setNewlyCreatedKey({
          rawKey: data.data.rawKey,
          keyPrefix: data.data.keyPrefix,
          name: data.data.name,
        });
        loadData();
      } else {
        message.error(data.error?.message || "Failed to rotate key");
      }
    } catch {
      message.error("Failed to rotate key");
    }
  };

  const copyToClipboard = (text: string, isCurl = false) => {
    navigator.clipboard.writeText(text);
    if (isCurl) {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    } else {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
    message.success("Copied to clipboard!");
  };

  const originUrl = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com";
  const messagesEndpoint = `${originUrl}/api/v1/messages`;

  const getCurlExample = (key: string) => {
    return `curl -X POST "${messagesEndpoint}" \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+15551234567",
    "type": "template",
    "template": {
      "name": "hello_world",
      "language": "en_US"
    }
  }'`;
  };

  const columns = [
    {
      title: "Name & Prefix",
      key: "name",
      render: (_: unknown, k: ApiKeyDisplayItem) => (
        <div>
          <div style={{ fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
            <KeyRound size={15} color="var(--brand)" />
            {k.name}
          </div>
          <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--muted)" }}>
            {k.keyPrefix}••••••••••••••••
          </div>
        </div>
      ),
    },
    {
      title: "Bound Number",
      dataIndex: "phoneNumberId",
      key: "phoneNumberId",
      render: (phoneId: string) => {
        const found = phoneNumbers.find((p) => p.phoneNumberId === phoneId);
        return (
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
              {found ? found.displayPhoneNumber : phoneId}
            </div>
            {found && <div style={{ fontSize: 10, color: "var(--muted)" }}>{found.verifiedName}</div>}
          </div>
        );
      },
    },
    {
      title: "Allowed Recipients",
      key: "allowedRecipients",
      width: 170,
      render: (_: unknown, k: ApiKeyDisplayItem) => {
        if (!k.allowedRecipients || k.allowedRecipients.length === 0) {
          return <span style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>Any number</span>;
        }
        if (k.allowedRecipients.length === 1) {
          return (
            <Tag style={{ fontSize: 11, fontFamily: "monospace", margin: 0 }}>
              {k.allowedRecipients[0]}
            </Tag>
          );
        }
        return (
          <Tooltip title={k.allowedRecipients.join(", ")}>
            <Tag color="cyan" style={{ fontSize: 11, fontFamily: "monospace", margin: 0, cursor: "pointer" }}>
              {k.allowedRecipients.length} restricted numbers
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: "Rate Limit",
      dataIndex: "rateLimitPerMinute",
      key: "rateLimitPerMinute",
      width: 110,
      render: (rate: number) => (
        <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text)" }}>
          {rate || 60} req/min
        </span>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 90,
      render: (status: string) => {
        let color = "success";
        if (status === "revoked") color = "default";
        else if (status === "expired") color = "warning";
        return (
          <Tag color={color} style={{ fontSize: 11, fontFamily: "monospace", textTransform: "uppercase" }}>
            {status}
          </Tag>
        );
      },
    },
    {
      title: "Last Used",
      dataIndex: "lastUsedAt",
      key: "lastUsedAt",
      width: 130,
      render: (time: string | null) => (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {time ? new Date(time).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never"}
        </span>
      ),
    },
    {
      title: "Expiry",
      dataIndex: "expiresAt",
      key: "expiresAt",
      width: 110,
      render: (time: string | null) => (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {time ? new Date(time).toLocaleDateString() : "Never"}
        </span>
      ),
    },
    {
      title: "Actions",
      key: "action",
      width: 210,
      render: (_: unknown, k: ApiKeyDisplayItem) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {k.status === "active" && (
            <>
              <Tooltip title="Edit name, rate limit, allowed recipients, and expiry">
                <Button
                  size="small"
                  type="text"
                  icon={<Pencil size={13} />}
                  onClick={() => handleOpenEdit(k)}
                  style={{ color: "var(--text)" }}
                >
                  Edit
                </Button>
              </Tooltip>
              <Tooltip title="Rotate key (generate new secret, revoke current)">
                <Button
                  size="small"
                  type="text"
                  icon={<RotateCw size={13} />}
                  onClick={() => handleRotate(k.id)}
                  style={{ color: "var(--brand)" }}
                >
                  Rotate
                </Button>
              </Tooltip>
              <Button
                size="small"
                danger
                type="text"
                icon={<Trash2 size={13} />}
                onClick={() => handleRevoke(k.id)}
              >
                Revoke
              </Button>
            </>
          )}
          {k.status !== "active" && (
            <span style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
              {k.status === "revoked" ? "Revoked" : "Expired"}
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      {/* Top Banner */}
      <div className={`glass-strong ${styles.topBar}`}>
        <div className={styles.headerText}>
          <h2 className={styles.title}>API Keys</h2>
          <p className={styles.subtitle}>
            Secure machine-to-machine authentication credentials for external services to dispatch WhatsApp messages via <code>POST /api/v1/messages</code>.
          </p>
        </div>
        <button
          onClick={() => {
            setCreateChips([]);
            createForm.resetFields();
            setIsCreateModalOpen(true);
          }}
          className="btn-primary"
          style={{ padding: "8px 18px", fontSize: 13 }}
        >
          <Plus size={16} />
          <span>Generate API Key</span>
        </button>
      </div>

      {/* Security Alert Banner */}
      <div className={`glass ${styles.alertBanner}`}>
        <ShieldAlert size={20} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
        <div className={styles.alertText}>
          <div style={{ fontWeight: 600, color: "var(--text)" }}>High-Entropy Security & Salted Hash Storage</div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
            API keys are generated using 32 cryptographically random bytes with format <code>wae_live_...</code>. Only the SHA-256 hash (salted with server-side <code>API_KEY_PEPPER</code>) is stored. Raw secret keys are displayed <strong>once</strong> at creation and can never be retrieved again.
          </div>
        </div>
      </div>

      {/* Copy-Once Modal (Never shown again) */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--brand)", fontWeight: 700 }}>
            <KeyRound size={18} /> API Key Generated Successfully
          </div>
        }
        open={Boolean(newlyCreatedKey)}
        onCancel={() => setNewlyCreatedKey(null)}
        footer={null}
        width={680}
        destroyOnClose
      >
        {newlyCreatedKey && (
          <div className={styles.modalContent}>
            <div className={styles.warningBox}>
              <strong>Important:</strong> Copy this API key now. For security reasons, it cannot be shown again.
            </div>

            <div className={styles.keyDisplaySection}>
              <div className={styles.sectionLabel}>Secret API Key:</div>
              <div className={styles.keyBoxRow}>
                <code className={styles.rawKeyText}>{newlyCreatedKey.rawKey}</code>
                <Button
                  type="primary"
                  icon={copiedKey ? <Check size={14} /> : <Copy size={14} />}
                  onClick={() => copyToClipboard(newlyCreatedKey.rawKey)}
                  style={{ backgroundColor: "var(--brand)" }}
                >
                  {copiedKey ? "Copied" : "Copy Key"}
                </Button>
              </div>
            </div>

            <div className={styles.endpointSection}>
              <div className={styles.sectionLabel}>
                <span>Public Messaging Endpoint:</span>
                <span className={styles.methodBadge}>POST</span>
              </div>
              <div className={styles.urlRow}>
                <code>{messagesEndpoint}</code>
                <Button
                  size="small"
                  icon={<Copy size={12} />}
                  onClick={() => copyToClipboard(messagesEndpoint)}
                >
                  Copy URL
                </Button>
              </div>
            </div>

            <div className={styles.curlSection}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span className={styles.sectionLabel} style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
                  <Terminal size={14} /> Ready-to-Use cURL Example:
                </span>
                <Button
                  size="small"
                  icon={copiedCurl ? <Check size={12} /> : <Copy size={12} />}
                  onClick={() => copyToClipboard(getCurlExample(newlyCreatedKey.rawKey), true)}
                >
                  {copiedCurl ? "Copied cURL" : "Copy cURL"}
                </Button>
              </div>
              <pre className={styles.codeBlock}>{getCurlExample(newlyCreatedKey.rawKey)}</pre>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button
                className="btn-primary"
                onClick={() => setNewlyCreatedKey(null)}
                style={{ padding: "8px 24px" }}
              >
                I Have Saved My Secret Key
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Keys Table */}
      <div className={`glass ${styles.tableWrapper}`}>
        <Table
          columns={columns}
          dataSource={keys}
          rowKey="id"
          loading={loading}
          scroll={{ x: 900 }}
          pagination={{ pageSize: 10 }}
        />
      </div>

      {/* Create Key Modal */}
      <Modal
        title="Generate New API Key"
        open={isCreateModalOpen}
        onCancel={() => {
          setIsCreateModalOpen(false);
          setCreateChips([]);
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{
            rateLimitPerMinute: 60,
            phoneNumberId: phoneNumbers[0]?.phoneNumberId,
          }}
        >
          <Form.Item
            name="name"
            label="Key Name / Client Service"
            rules={[{ required: true, message: "Please provide a name for this API key" }]}
          >
            <Input placeholder="e.g. Production Order Notification Service" className="glass-input" />
          </Form.Item>

          <Form.Item
            name="phoneNumberId"
            label="Bound Sender Phone Number"
            rules={[{ required: true, message: "Please select a bound WhatsApp phone number" }]}
            extra="All outbound messages dispatched with this key will originate from this verified number."
          >
            <Select
              placeholder="Select sender phone number"
              options={
                phoneNumbers.length > 0
                  ? phoneNumbers.map((p) => ({
                      value: p.phoneNumberId,
                      label: `${p.displayPhoneNumber} (${p.verifiedName})`,
                    }))
                  : [{ value: "default", label: "Default Provisioned Sender" }]
              }
            />
          </Form.Item>

          <Form.Item
            name="rateLimitPerMinute"
            label="Rate Limit (requests per minute)"
            rules={[{ required: true }]}
            extra="Incoming requests exceeding this threshold return HTTP 429 with Retry-After."
          >
            <Input type="number" min={1} max={1000} className="glass-input" />
          </Form.Item>

          <Form.Item
            label="Allowed Recipient Phone Numbers (Optional)"
          >
            <RecipientChipsInput
              recipients={createChips}
              onChange={setCreateChips}
            />
          </Form.Item>

          <Form.Item
            name="expiresAt"
            label="Expiration Date (Optional)"
            extra="Leave blank for a key with no expiration date."
          >
            <Input type="date" className="glass-input" />
          </Form.Item>

          <div className={styles.modalFooter}>
            <button
              type="button"
              onClick={() => {
                setIsCreateModalOpen(false);
                setCreateChips([]);
              }}
              className="btn-secondary"
              style={{ padding: "8px 16px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ padding: "8px 20px" }}
            >
              Generate Secret Key
            </button>
          </div>
        </Form>
      </Modal>

      {/* Edit Key Modal (PATCH /api/api-keys/{id}) */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text)", fontWeight: 700 }}>
            <Pencil size={16} color="var(--brand)" /> Edit API Key: {editingKey?.name}
          </div>
        }
        open={Boolean(editingKey)}
        onCancel={() => {
          setEditingKey(null);
          setEditChips([]);
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleUpdate}
        >
          <Form.Item
            name="name"
            label="Key Name / Client Service"
            rules={[{ required: true, message: "Please provide a name for this API key" }]}
          >
            <Input placeholder="e.g. Production Order Notification Service" className="glass-input" />
          </Form.Item>

          <Form.Item
            name="rateLimitPerMinute"
            label="Rate Limit (requests per minute)"
            rules={[{ required: true, message: "Please specify a rate limit" }]}
            extra="Requests exceeding this threshold return HTTP 429 with Retry-After."
          >
            <Input type="number" min={1} max={1000} className="glass-input" />
          </Form.Item>

          <Form.Item
            label="Allowed Recipient Phone Numbers (Optional)"
          >
            <RecipientChipsInput
              recipients={editChips}
              onChange={setEditChips}
            />
          </Form.Item>

          <Form.Item
            name="expiresAt"
            label="Expiration Date (Optional)"
            extra="Leave blank for no expiration."
          >
            <Input type="date" className="glass-input" />
          </Form.Item>

          <div className={styles.modalFooter}>
            <button
              type="button"
              onClick={() => {
                setEditingKey(null);
                setEditChips([]);
              }}
              className="btn-secondary"
              style={{ padding: "8px 16px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ padding: "8px 20px" }}
            >
              Save Changes
            </button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
