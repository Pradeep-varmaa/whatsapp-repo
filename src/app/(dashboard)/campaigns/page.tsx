"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, Tag, Progress, message, Space, Upload } from "antd";
import { Megaphone, Plus, RefreshCw, Upload as UploadIcon, Send } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

interface Campaign {
  id: string;
  name: string;
  template_name: string;
  template_language: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  rate_limit_mps: number;
  created_at: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recipientsText, setRecipientsText] = useState("");
  const [form] = Form.useForm();

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      if (data.success) setCampaigns(data.campaigns || []);
    } catch {
      message.error("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const parseRecipients = (raw: string) => {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [phone, ...vars] = line.split(",").map((s) => s.trim());
        const variables: Record<string, string> = {};
        vars.forEach((v, idx) => {
          if (v) variables[`var${idx + 1}`] = v;
        });
        return { phone, variables };
      });
  };

  const handleCreate = async (values: { name: string; templateName: string; templateLanguage: string; rateLimitMps: number }) => {
    const recipients = parseRecipients(recipientsText);
    if (recipients.length === 0) {
      message.warning("Please enter or upload at least one recipient phone number.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          recipients,
        }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(`Campaign launched with ${data.queuedRecipients} recipient(s) queued!`);
        setModalOpen(false);
        form.resetFields();
        setRecipientsText("");
        fetchCampaigns();
      } else {
        message.error(data.error || "Failed to launch campaign");
      }
    } catch {
      message.error("Network error launching campaign");
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { title: "Campaign", dataIndex: "name", key: "name", render: (n: string) => <strong>{n}</strong> },
    {
      title: "Template",
      key: "template",
      render: (_: unknown, r: Campaign) => <Tag color="blue">{r.template_name} ({r.template_language})</Tag>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (s: string) => <Tag color={s === "completed" ? "success" : s === "running" ? "processing" : "default"}>{s.toUpperCase()}</Tag>,
    },
    {
      title: "Progress",
      key: "progress",
      render: (_: unknown, r: Campaign) => {
        const pct = r.total_recipients > 0 ? Math.round((r.sent_count / r.total_recipients) * 100) : 0;
        return (
          <div style={{ minWidth: 160 }}>
            <Progress percent={pct} size="small" strokeColor="#25D366" />
            <span style={{ fontSize: 11, opacity: 0.7 }}>{r.sent_count} / {r.total_recipients} queued</span>
          </div>
        );
      },
    },
    {
      title: "Throttle",
      dataIndex: "rate_limit_mps",
      key: "mps",
      render: (mps: number) => `${mps} msg/s`,
    },
    {
      title: "Created",
      dataIndex: "created_at",
      key: "created_at",
      render: (d: string) => new Date(d).toLocaleString(),
    },
  ];

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            <Megaphone size={22} color="#25D366" />
            Broadcast Campaigns
          </h1>
          <p style={{ margin: "4px 0 0", opacity: 0.72, fontSize: 13 }}>
            Upload CSV audiences, map template variables, and dispatch via BullMQ with MPS rate throttling.
          </p>
        </div>
        <Space>
          <Button icon={<RefreshCw size={15} />} onClick={fetchCampaigns} loading={loading}>
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<Plus size={15} />}
            onClick={() => setModalOpen(true)}
            style={{ background: "#25D366", borderColor: "#25D366", color: "#0B141A", fontWeight: 600 }}
          >
            New Campaign
          </Button>
        </Space>
      </div>

      <GlassCard style={{ padding: 16 }}>
        <Table rowKey="id" columns={columns} dataSource={campaigns} loading={loading} pagination={{ pageSize: 12 }} />
      </GlassCard>

      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        title="Launch Broadcast Campaign"
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ templateLanguage: "en_US", rateLimitMps: 10 }}
          onFinish={handleCreate}
        >
          <Form.Item name="name" label="Campaign Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. November Product Launch" />
          </Form.Item>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px", gap: 12 }}>
            <Form.Item name="templateName" label="Approved Template Name" rules={[{ required: true }]}>
              <Input placeholder="hello_world" />
            </Form.Item>
            <Form.Item name="templateLanguage" label="Language">
              <Input placeholder="en_US" />
            </Form.Item>
            <Form.Item name="rateLimitMps" label="Max MPS">
              <InputNumber min={1} max={80} style={{ width: "100%" }} />
            </Form.Item>
          </div>
          <Form.Item label="Recipients (one E.164 phone per line, optional CSV variables: +919876543210,John)">
            <Space style={{ marginBottom: 8 }}>
              <Upload
                accept=".csv,.txt"
                showUploadList={false}
                beforeUpload={(file) => {
                  const reader = new FileReader();
                  reader.onload = (e) => setRecipientsText(String(e.target?.result || ""));
                  reader.readAsText(file);
                  return false;
                }}
              >
                <Button size="small" icon={<UploadIcon size={13} />}>Load CSV / TXT</Button>
              </Upload>
            </Space>
            <Input.TextArea
              rows={5}
              value={recipientsText}
              onChange={(e) => setRecipientsText(e.target.value)}
              placeholder={"+15551234567,Alice\n+919876543210,Bob"}
            />
          </Form.Item>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              icon={<Send size={14} />}
              style={{ background: "#25D366", borderColor: "#25D366", color: "#0B141A", fontWeight: 600 }}
            >
              Launch Campaign
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
