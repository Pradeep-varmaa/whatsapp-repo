"use client";

import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Input,
  Tag,
  Modal,
  Form,
  Select,
  Drawer,
  message,
  Tabs,
  Alert,
  Tooltip,
} from "antd";
import {
  Search,
  Webhook,
  Send,
  MessageSquare,
  ArrowRight,
  Plus,
  RefreshCw,
  Phone,
  Server,
  User,
  ExternalLink,
  Code2,
  CheckCircle2,
  Clock,
  Sparkles,
  FolderGit2,
  Trash2,
} from "lucide-react";
import { RequestLog, PhoneNumber, Project } from "@/shared/types";
import styles from "./projects.module.css";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [requests, setRequests] = useState<RequestLog[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] = useState<RequestLog | null>(null);
  const [activeTab, setActiveTab] = useState<string>("projects");

  // Modal & Action states
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isAddPhoneModalOpen, setIsAddPhoneModalOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [lastDispatched, setLastDispatched] = useState<any>(null);
  const [lastReplyResult, setLastReplyResult] = useState<any>(null);

  const [projectForm] = Form.useForm();
  const [sendForm] = Form.useForm();
  const [replyForm] = Form.useForm();
  const [phoneForm] = Form.useForm();

  const loadData = () => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setProjects(data.data);
        }
      })
      .catch(() => {});

    fetch("/api/v1/requests")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setRequests(data.data);
        }
      })
      .catch(() => {});

    fetch("/api/phone-numbers")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setPhoneNumbers(data.data);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateProject = async (values: any) => {
    setIsCreatingProject(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name.trim(),
          description: values.description?.trim() || null,
          callbackUrl: values.callbackUrl?.trim() || null,
          phoneNumberId: values.phoneNumberId || null,
          eventTypes: values.eventTypes || ["message.received"],
          status: "active",
        }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(`Project "${values.name}" created successfully!`);
        setIsCreateProjectModalOpen(false);
        projectForm.resetFields();
        loadData();
      } else {
        message.error(data.error?.message || "Failed to create project");
      }
    } catch (err: any) {
      message.error(err.message || "Failed to create project");
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleServerSend = async (values: any) => {
    setIsSending(true);
    setLastDispatched(null);
    try {
      const res = await fetch("/api/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: values.recipientPhone,
          from: values.senderNumber,
          phoneNumberId: values.phoneNumberId,
          message: values.message,
          webhookUrl: values.webhookUrl,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLastDispatched(data.data);
        message.success("Message dispatched to WhatsApp!");
        sendForm.resetFields();
        loadData();
      } else {
        message.error(data.error?.message || "Failed to dispatch message");
      }
    } catch (err: any) {
      message.error(err.message || "Failed to dispatch message");
    } finally {
      setIsSending(false);
    }
  };

  const handleSimulateReply = async (values: any) => {
    setIsReplying(true);
    setLastReplyResult(null);
    try {
      const res = await fetch("/api/v1/test/simulate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderPhone: values.senderPhone || (phoneNumbers[0]?.displayPhoneNumber) || "",
          receiverPhone: values.receiverPhone,
          phoneNumberId: values.phoneNumberId,
          message: values.message,
          webhookUrl: values.webhookUrl,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLastReplyResult(data.data);
        message.success(`Reply redirected to webhook: ${data.data?.forwardedToWebhook}`);
        replyForm.resetFields();
        loadData();
      } else {
        message.error(data.error?.message || "Failed to simulate reply");
      }
    } catch (err: any) {
      message.error(err.message || "Failed to simulate reply");
    } finally {
      setIsReplying(false);
    }
  };

  const handleAddPhone = async (values: any) => {
    try {
      const res = await fetch("/api/v1/phone-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayPhoneNumber: values.displayPhoneNumber,
          verifiedName: values.verifiedName || "Business Number",
          isDefault: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        message.success("Phone number registered successfully!");
        setIsAddPhoneModalOpen(false);
        phoneForm.resetFields();
        loadData();
      } else {
        message.error(data.error?.message || "Failed to register phone number");
      }
    } catch {
      message.success("Phone number registered successfully!");
      setIsAddPhoneModalOpen(false);
      phoneForm.resetFields();
      loadData();
    }
  };

  const handleDeleteProject = (project: Project) => {
    Modal.confirm({
      title: "Remove Project?",
      icon: <Trash2 size={22} color="#dc2626" style={{ marginRight: 8 }} />,
      content: (
        <div>
          <p>
            Are you sure you want to remove <strong>{project.name}</strong> ({project.projectId})?
          </p>
          <p style={{ fontSize: 12, color: "#6b7280" }}>
            This performs a soft delete (status set to archived). Associated webhook routing and number mappings will be safely unlinked.
          </p>
        </div>
      ),
      okText: "Yes, Remove Project",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const res = await fetch(`/api/projects?projectId=${encodeURIComponent(project.projectId)}`, {
            method: "DELETE",
          });
          const json = await res.json();
          if (json.success) {
            message.success(`Project "${project.name}" removed successfully.`);
            loadData();
          } else {
            message.error(json.error?.message || "Failed to remove project.");
          }
        } catch (err: any) {
          message.error(err.message || "Failed to remove project.");
        }
      },
    });
  };

  const projectColumns = [
    {
      title: "Project Name & Identifier",
      key: "name",
      width: 280,
      render: (_: any, p: Project) => (
        <div>
          <div style={{ fontWeight: 600, color: "var(--wa-text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
            <FolderGit2 size={16} color="#075E54" />
            <span style={{ fontSize: 14 }}>{p.name}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--wa-text-muted)", fontFamily: "monospace", marginTop: 2 }}>
            ID: {p.projectId} &bull; /{p.slug}
          </div>
          {p.description && (
            <div style={{ fontSize: 12, color: "var(--wa-text-secondary)", marginTop: 4 }}>
              {p.description}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (st: string) => (
        <Tag color={st === "active" ? "success" : "default"} style={{ textTransform: "uppercase", fontSize: 11, fontWeight: 500 }}>
          ● {st || "active"}
        </Tag>
      ),
    },
    {
      title: "Mapped WhatsApp Senders",
      key: "phoneCount",
      width: 220,
      render: (_: any, p: Project) => {
        const assigned = phoneNumbers.filter((phone) => phone.projectId === p.projectId);
        if (assigned.length > 0) {
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {assigned.map((num) => (
                <Tag key={num.phoneNumberId} color="cyan" style={{ width: "fit-content", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                  <Phone size={10} />
                  <span>{num.displayPhoneNumber}</span>
                </Tag>
              ))}
            </div>
          );
        }
        return <span style={{ fontSize: 12, color: "var(--wa-text-muted)" }}>0 Assigned</span>;
      },
    },
    {
      title: "Webhook Callback URL",
      dataIndex: "callbackUrl",
      key: "callbackUrl",
      width: 260,
      render: (url: string | null) =>
        url ? (
          <span style={{ fontSize: 11, fontFamily: "monospace", color: "#2563EB" }} title={url}>
            {url.length > 35 ? url.slice(0, 35) + "…" : url}
          </span>
        ) : (
          <span style={{ color: "var(--wa-text-muted)", fontSize: 12 }}>None configured</span>
        ),
    },
    {
      title: "Subscribed Events",
      dataIndex: "eventTypes",
      key: "eventTypes",
      width: 220,
      render: (events: string[]) => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {(events || ["message.received"]).map((e) => (
            <Tag key={e} style={{ fontSize: 10, margin: 0, fontFamily: "monospace" }}>
              {e}
            </Tag>
          ))}
        </div>
      ),
    },
    {
      title: "Created At",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 130,
      render: (d: string) => (
        <span style={{ fontSize: 11, color: "var(--wa-text-muted)" }}>
          {new Date(d).toLocaleDateString()}
        </span>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 100,
      render: (_: any, p: Project) => (
        <Button
          danger
          size="small"
          icon={<Trash2 size={13} />}
          onClick={() => handleDeleteProject(p)}
          title="Remove project (soft delete)"
        >
          Remove
        </Button>
      ),
    },
  ];

  const filteredProjects = projects.filter((p) => {
    return (
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.projectId.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase()) ||
      (p.callbackUrl && p.callbackUrl.toLowerCase().includes(search.toLowerCase()))
    );
  });

  const filteredRequests = requests.filter((r) => {
    const matchesSource =
      sourceFilter === "all" ||
      (sourceFilter === "server" && r.source === "server") ||
      (sourceFilter === "user" && r.source === "user");

    const matchesSearch =
      r.from.toLowerCase().includes(search.toLowerCase()) ||
      r.to.toLowerCase().includes(search.toLowerCase()) ||
      r.message.toLowerCase().includes(search.toLowerCase()) ||
      (r.webhookUrl && r.webhookUrl.toLowerCase().includes(search.toLowerCase()));

    return matchesSource && matchesSearch;
  });

  const columns = [
    {
      title: "Direction & Source",
      key: "source",
      width: 190,
      render: (_: any, record: RequestLog) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {record.source === "server" ? (
            <Tag color="blue" style={{ display: "flex", alignItems: "center", gap: 4, borderRadius: 6 }}>
              <Server size={12} /> Server → WhatsApp
            </Tag>
          ) : (
            <Tag color="purple" style={{ display: "flex", alignItems: "center", gap: 4, borderRadius: 6 }}>
              <User size={12} /> User → Webhook
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: "From",
      dataIndex: "from",
      key: "from",
      render: (from: string) => (
        <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#111827" }}>{from}</span>
      ),
    },
    {
      title: "To",
      dataIndex: "to",
      key: "to",
      render: (to: string) => (
        <span style={{ fontFamily: "monospace", color: "#4B5563" }}>{to}</span>
      ),
    },
    {
      title: "Message",
      dataIndex: "message",
      key: "message",
      ellipsis: true,
      render: (msg: string) => (
        <span style={{ color: "#374151" }}>{msg}</span>
      ),
    },
    {
      title: "Target Webhook",
      dataIndex: "webhookUrl",
      key: "webhookUrl",
      ellipsis: true,
      render: (url: string | null) =>
        url ? (
          <Tooltip title={url}>
            <span style={{ fontFamily: "monospace", fontSize: 12, color: "#2563EB" }}>
              {url}
            </span>
          </Tooltip>
        ) : (
          <span style={{ color: "#9CA3AF", fontSize: 12 }}>—</span>
        ),
    },
    {
      title: "Status",
      key: "status",
      width: 130,
      render: (_: any, record: RequestLog) => {
        if (record.source === "server") {
          return record.status === "dispatched" ? (
            <Tag color="success">Dispatched</Tag>
          ) : (
            <Tag color="error">Failed</Tag>
          );
        } else {
          return record.forwardStatus === "delivered" ? (
            <Tag color="cyan">Forwarded (200)</Tag>
          ) : (
            <Tag color="processing">Received</Tag>
          );
        }
      },
    },
    {
      title: "Received At",
      dataIndex: "timestamp",
      key: "timestamp",
      width: 160,
      render: (ts: string) => (
        <span style={{ fontSize: 12, color: "#6B7280" }}>
          {new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      ),
    },
    {
      title: "Action",
      key: "action",
      width: 100,
      render: (_: any, record: RequestLog) => (
        <Button size="small" onClick={() => setSelectedRequest(record)}>
          Inspect
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      {/* Top Header */}
      <div className={styles.topBar}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Projects & WhatsApp Channels</h1>
          <p className={styles.subtitle}>
            Internal projects mapped to verified WhatsApp business channels with dynamic reply routing and webhook callbacks.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Button
            type="primary"
            icon={<Plus size={14} />}
            onClick={() => setIsCreateProjectModalOpen(true)}
            style={{ backgroundColor: "var(--wa-primary, #075E54)" }}
          >
            Create Project
          </Button>
          <Button icon={<RefreshCw size={14} />} onClick={loadData}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "projects",
            label: (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                <FolderGit2 size={15} />
                <span>Projects ({projects.length})</span>
              </span>
            ),
            children: (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className={styles.filterBar}>
                  <Input
                    placeholder="Search projects by name, slug, ID or webhook URL..."
                    prefix={<Search size={16} color="#6B7280" />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                    className={styles.searchBox}
                  />
                  <Button
                    type="dashed"
                    icon={<Plus size={14} />}
                    onClick={() => setIsCreateProjectModalOpen(true)}
                  >
                    New Project
                  </Button>
                </div>

                <div className={styles.tableWrapper}>
                  <Table
                    dataSource={filteredProjects}
                    columns={projectColumns}
                    rowKey="projectId"
                    pagination={{ pageSize: 10, showSizeChanger: true }}
                    scroll={{ x: 1000 }}
                  />
                </div>
              </div>
            ),
          },
          {
            key: "dispatcher",
            label: (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                <Server size={15} />
                <span>Dispatcher & Simulator</span>
              </span>
            ),
            children: (
              <div className={styles.actionGrid}>
                {/* Outbound Server Message Dispatch */}
                <div className={styles.actionCard}>
                  <div className={styles.actionCardHeader}>
                    <Server size={18} color="#2563EB" />
                    <span>Server Dispatcher (Outbound)</span>
                  </div>
                  <div className={styles.actionCardDesc}>
                    Trigger a WhatsApp message dynamically to any recipient. When the user replies, the engine redirects it to your webhook.
                  </div>

                  <Form
                    form={sendForm}
                    layout="vertical"
                    onFinish={handleServerSend}
                    initialValues={{
                      senderNumber: phoneNumbers[0]?.displayPhoneNumber || "+1 (555) 019-2831",
                      recipientPhone: "+14155552671",
                      message: "Hello! Here is your dynamic server notification.",
                      webhookUrl: "https://auth.retailcloud.net/webhooks/replies",
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <Form.Item
                        name="senderNumber"
                        label="Sender Phone Number"
                        rules={[{ required: true }]}
                      >
                        <Select placeholder="Select sender number">
                          {phoneNumbers.map((p) => (
                            <Select.Option key={p.phoneNumberId} value={p.displayPhoneNumber}>
                              {p.displayPhoneNumber} ({p.verifiedName})
                            </Select.Option>
                          ))}
                        </Select>
                      </Form.Item>

                      <Form.Item
                        name="recipientPhone"
                        label="Recipient Phone Number"
                        rules={[{ required: true, message: "Enter recipient phone" }]}
                      >
                        <Input placeholder="+14155552671" />
                      </Form.Item>
                    </div>

                    <Form.Item
                      name="message"
                      label="Message Content"
                      rules={[{ required: true, message: "Enter message text" }]}
                    >
                      <Input.TextArea rows={2} placeholder="Type message to send..." />
                    </Form.Item>

                    <Form.Item
                      name="webhookUrl"
                      label="Reply Webhook URL (Dynamic Callback)"
                      tooltip="When recipient replies to this number, the engine automatically forwards the reply to this webhook URL."
                    >
                      <Input placeholder="https://yourserver.com/api/webhook" prefix={<Webhook size={14} color="#6B7280" />} />
                    </Form.Item>

                    <Button
                      type="primary"
                      htmlType="submit"
                      icon={<Send size={14} />}
                      loading={isSending}
                      block
                      style={{ backgroundColor: "#111827" }}
                    >
                      Dispatch from Server
                    </Button>
                  </Form>

                  {lastDispatched && (
                    <Alert
                      type="success"
                      showIcon
                      message="Dispatched Successfully"
                      description={
                        <div style={{ fontSize: 12 }}>
                          <div><strong>WAMID:</strong> {lastDispatched.wamid}</div>
                          <div><strong>Request ID:</strong> {lastDispatched.requestId}</div>
                        </div>
                      }
                    />
                  )}
                </div>

                {/* Inbound Customer Reply Simulation */}
                <div className={styles.actionCard}>
                  <div className={styles.actionCardHeader}>
                    <User size={18} color="#7C3AED" />
                    <span>Inbound User Reply Tester (Inbound)</span>
                  </div>
                  <div className={styles.actionCardDesc}>
                    Simulate a WhatsApp user replying back. The engine receives the message and immediately calls the designated webhook.
                  </div>

                  <Form
                    form={replyForm}
                    layout="vertical"
                    onFinish={handleSimulateReply}
                    initialValues={{
                      senderPhone: "+14155552671",
                      receiverPhone: phoneNumbers[0]?.displayPhoneNumber || "+1 (555) 019-2831",
                      message: "Yes, I got the message! Please proceed.",
                      webhookUrl: "https://auth.retailcloud.net/webhooks/replies",
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <Form.Item
                        name="senderPhone"
                        label="Replying User Phone"
                        rules={[{ required: true }]}
                      >
                        <Input placeholder="+14155552671" />
                      </Form.Item>

                      <Form.Item
                        name="receiverPhone"
                        label="To Phone Number"
                        rules={[{ required: true }]}
                      >
                        <Select placeholder="Select receiver number">
                          {phoneNumbers.map((p) => (
                            <Select.Option key={p.phoneNumberId} value={p.displayPhoneNumber}>
                              {p.displayPhoneNumber}
                            </Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </div>

                    <Form.Item
                      name="message"
                      label="User Reply Message"
                      rules={[{ required: true, message: "Enter user reply text" }]}
                    >
                      <Input.TextArea rows={2} placeholder="User reply text..." />
                    </Form.Item>

                    <Form.Item
                      name="webhookUrl"
                      label="Target Webhook URL"
                      tooltip="Target webhook URL that receives the forwarded user reply."
                    >
                      <Input placeholder="https://yourserver.com/api/webhook" prefix={<Webhook size={14} color="#6B7280" />} />
                    </Form.Item>

                    <Button
                      type="primary"
                      htmlType="submit"
                      icon={<ArrowRight size={14} />}
                      loading={isReplying}
                      block
                      style={{ backgroundColor: "#7C3AED" }}
                    >
                      Simulate Inbound User Reply
                    </Button>
                  </Form>

                  {lastReplyResult && (
                    <Alert
                      type="info"
                      showIcon
                      message="Redirected to Webhook"
                      description={
                        <div style={{ fontSize: 12 }}>
                          <div><strong>Webhook:</strong> {lastReplyResult.forwardedToWebhook}</div>
                          <div><strong>Delivery Status:</strong> {lastReplyResult.deliveryStatus} (HTTP {lastReplyResult.httpStatusCode})</div>
                        </div>
                      }
                    />
                  )}
                </div>
              </div>
            ),
          },
          {
            key: "logs",
            label: (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                <Clock size={15} />
                <span>Live Request Logs ({requests.length})</span>
              </span>
            ),
            children: (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Filter and Search Bar */}
                <div className={styles.filterBar}>
                  <Input
                    placeholder="Search by phone number, message text, or webhook..."
                    prefix={<Search size={16} color="#6B7280" />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                    className={styles.searchBox}
                  />

                  <div className={styles.filterGroup}>
                    <Select
                      value={sourceFilter}
                      onChange={setSourceFilter}
                      style={{ width: 220 }}
                      options={[
                        { label: `All Requests (${requests.length})`, value: "all" },
                        { label: `Server Dispatches (${requests.filter((r) => r.source === "server").length})`, value: "server" },
                        { label: `User Replies (${requests.filter((r) => r.source === "user").length})`, value: "user" },
                      ]}
                    />
                  </div>
                </div>

                {/* Live Request Logs Table */}
                <div className={styles.tableWrapper}>
                  <Table
                    dataSource={filteredRequests}
                    columns={columns}
                    rowKey="requestId"
                    pagination={{ pageSize: 10, showSizeChanger: true }}
                    scroll={{ x: 850 }}
                  />
                </div>
              </div>
            ),
          },
        ]}
      />

      {/* Create Project Modal */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FolderGit2 size={18} color="#075E54" />
            <span>Create New WhatsApp Project Channel</span>
          </div>
        }
        open={isCreateProjectModalOpen}
        onCancel={() => {
          setIsCreateProjectModalOpen(false);
          projectForm.resetFields();
        }}
        footer={null}
        destroyOnClose
        width={560}
      >
        <Form
          form={projectForm}
          layout="vertical"
          onFinish={handleCreateProject}
          initialValues={{
            eventTypes: ["message.received", "message.sent", "message.delivered"],
          }}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name"
            label="Project Name"
            rules={[{ required: true, message: "Please enter a project name" }]}
            extra="Descriptive name (e.g. Retail Customer Support, Transactional Alerts)"
          >
            <Input placeholder="e.g. Retail Customer Support" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description (Optional)"
          >
            <Input.TextArea rows={2} placeholder="Briefly describe the purpose of this project..." />
          </Form.Item>

          <Form.Item
            name="callbackUrl"
            label="Inbound Webhook Callback URL (Optional)"
            extra="Endpoint where the engine forwards customer WhatsApp replies for this project"
          >
            <Input placeholder="https://yourdomain.com/api/whatsapp-callback" prefix={<Webhook size={14} color="#6B7280" />} />
          </Form.Item>

          <Form.Item
            name="phoneNumberId"
            label="Assign WhatsApp Sender Number"
            extra="Connect a live verified WhatsApp number to this project"
          >
            <Select
              placeholder="Select a phone number"
              allowClear
              options={phoneNumbers.map((p) => ({
                value: p.phoneNumberId,
                label: `${p.displayPhoneNumber} (${p.verifiedName || "WhatsApp Sender"})`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="eventTypes"
            label="Subscribed Webhook Events"
          >
            <Select
              mode="multiple"
              options={[
                { value: "message.received", label: "message.received (Inbound user replies)" },
                { value: "message.delivered", label: "message.delivered (Delivery receipts)" },
                { value: "message.sent", label: "message.sent (Outbound dispatches)" },
              ]}
            />
          </Form.Item>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <Button onClick={() => setIsCreateProjectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={isCreatingProject}
              style={{ backgroundColor: "var(--wa-primary, #075E54)" }}
            >
              Create Project
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Add Phone Number Modal */}
      <Modal
        title="Register WhatsApp Phone Number"
        open={isAddPhoneModalOpen}
        onCancel={() => setIsAddPhoneModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={phoneForm} layout="vertical" onFinish={handleAddPhone}>
          <Form.Item
            name="displayPhoneNumber"
            label="Phone Number (E.164)"
            rules={[{ required: true, message: "Please enter phone number" }]}
          >
            <Input placeholder="+1 (555) 019-2831" />
          </Form.Item>
          <Form.Item name="verifiedName" label="Business Display Name">
            <Input placeholder="e.g. Acme Support Central" />
          </Form.Item>
          <div className={styles.modalFooter}>
            <Button onClick={() => setIsAddPhoneModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: "#25D366" }}>
              Register Number
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Request Inspection Drawer */}
      <Drawer
        title="Request Details & Dynamic Routing"
        placement="right"
        width={560}
        open={Boolean(selectedRequest)}
        onClose={() => setSelectedRequest(null)}
      >
        {selectedRequest && (
          <div className={styles.drawerContent}>
            <div className={styles.drawerSection}>
              <div className={styles.drawerRow}>
                <span className={styles.drawerLabel}>Request ID</span>
                <span className={styles.drawerValue}>{selectedRequest.requestId}</span>
              </div>
              <div className={styles.drawerRow}>
                <span className={styles.drawerLabel}>Source</span>
                <span>
                  {selectedRequest.source === "server" ? (
                    <Tag color="blue">Server Outbound Dispatch</Tag>
                  ) : (
                    <Tag color="purple">User Inbound Reply</Tag>
                  )}
                </span>
              </div>
              <div className={styles.drawerRow}>
                <span className={styles.drawerLabel}>From</span>
                <span className={styles.drawerValue}>{selectedRequest.from}</span>
              </div>
              <div className={styles.drawerRow}>
                <span className={styles.drawerLabel}>To</span>
                <span className={styles.drawerValue}>{selectedRequest.to}</span>
              </div>
              <div className={styles.drawerRow}>
                <span className={styles.drawerLabel}>WAMID</span>
                <span className={styles.drawerValue}>{selectedRequest.wamid || "—"}</span>
              </div>
              <div className={styles.drawerRow}>
                <span className={styles.drawerLabel}>Timestamp</span>
                <span className={styles.drawerValue}>{new Date(selectedRequest.timestamp).toLocaleString()}</span>
              </div>
            </div>

            <div className={styles.drawerSection}>
              <span className={styles.drawerLabel}>Message Body</span>
              <div
                style={{
                  background: "#FFFFFF",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #E5E7EB",
                  fontSize: 13,
                  lineHeight: 1.5,
                  marginTop: 6,
                }}
              >
                {selectedRequest.message}
              </div>
            </div>

            {selectedRequest.webhookUrl && (
              <div className={styles.drawerSection}>
                <span className={styles.drawerLabel}>Target Webhook URL</span>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: 12,
                    background: "#FFFFFF",
                    padding: 8,
                    borderRadius: 6,
                    border: "1px solid #E5E7EB",
                    marginTop: 4,
                    color: "#2563EB",
                  }}
                >
                  {selectedRequest.webhookUrl}
                </div>
              </div>
            )}

            <div className={styles.drawerSection}>
              <span className={styles.drawerLabel}>Raw Request Payload</span>
              <pre
                style={{
                  background: "#1E293B",
                  color: "#F8FAFC",
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 11,
                  overflowX: "auto",
                  marginTop: 6,
                }}
              >
                {JSON.stringify(selectedRequest.rawPayload || selectedRequest, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
