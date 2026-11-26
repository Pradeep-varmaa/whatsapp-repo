"use client";

import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Input,
  Tag,
  Modal,
  Select,
  message,
  Tooltip,
  Popconfirm,
} from "antd";
import {
  FileText,
  Plus,
  Trash2,
  Copy,
  Check,
  Eye,
  RefreshCw,
  Layers,
  GripVertical,
  ExternalLink,
  Phone,
  ArrowUp,
  ArrowDown,
  Terminal,
  Heading,
  MessageSquare,
  Bookmark,
  MousePointerClick,
} from "lucide-react";
import styles from "./templates.module.css";

interface TemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
}

interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  example?: any;
  buttons?: TemplateButton[];
}

interface TemplateItem {
  id: string;
  name: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION" | string;
  language: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | string;
  components: TemplateComponent[];
  updatedAt?: string;
}

type PaletteComponentType = "HEADER" | "BODY" | "FOOTER" | "BUTTONS";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  // Create Builder Modal state
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [builderName, setBuilderName] = useState("");
  const [builderCategory, setBuilderCategory] = useState<"UTILITY" | "MARKETING" | "AUTHENTICATION">("UTILITY");
  const [builderLanguage, setBuilderLanguage] = useState("en_US");
  const [activeComponents, setActiveComponents] = useState<TemplateComponent[]>([
    {
      type: "BODY",
      text: "Hello {{1}}, thank you for choosing our service! Your order {{2}} has been confirmed.",
      example: { body_text: [["John", "ORD-9821"]] },
    },
    {
      type: "FOOTER",
      text: "Reply STOP to unsubscribe",
    },
    {
      type: "BUTTONS",
      buttons: [
        { type: "QUICK_REPLY", text: "Track Order" },
        { type: "URL", text: "Visit Portal", url: "https://example.com" },
      ],
    },
  ]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Preview & cURL Modal state
  const [previewTemplate, setPreviewTemplate] = useState<TemplateItem | null>(null);
  const [curlTemplate, setCurlTemplate] = useState<TemplateItem | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/meta/templates");
      const json = await res.json();
      if (json.success && json.data?.templates) {
        setTemplates(json.data.templates);
      }
    } catch {
      message.error("Failed to load templates from Meta");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleDelete = async (name: string) => {
    try {
      const res = await fetch(`/api/v1/meta/templates?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        message.success(`Template ${name} deleted`);
        setTemplates((prev) => prev.filter((t) => t.name !== name));
      } else {
        message.error(data.error?.message || "Failed to delete template");
      }
    } catch {
      message.error("Failed to delete template");
    }
  };

  // Drag and Drop palette handlers
  const handleDragStart = (e: React.DragEvent, type: PaletteComponentType) => {
    e.dataTransfer.setData("componentType", type);
  };

  const addComponentBlock = (type: PaletteComponentType) => {
    if (activeComponents.some((c) => c.type === type && type !== "BUTTONS")) {
      message.warning(`A ${type.toLowerCase()} block is already on the canvas.`);
      return;
    }

    let newComp: TemplateComponent;
    if (type === "HEADER") {
      newComp = { type: "HEADER", format: "TEXT", text: "Important Notification" };
    } else if (type === "BODY") {
      newComp = { type: "BODY", text: "Hi {{1}}, here is an update regarding your request." };
    } else if (type === "FOOTER") {
      newComp = { type: "FOOTER", text: "Thank you for being our customer" };
    } else {
      newComp = {
        type: "BUTTONS",
        buttons: [{ type: "QUICK_REPLY", text: "Confirm" }],
      };
    }

    setActiveComponents((prev) => [...prev, newComp]);
  };

  const removeComponentBlock = (index: number) => {
    setActiveComponents((prev) => prev.filter((_, i) => i !== index));
  };

  const moveComponentBlock = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === activeComponents.length - 1) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    const updated = [...activeComponents];
    const [moved] = updated.splice(index, 1);
    updated.splice(newIndex, 0, moved);
    setActiveComponents(updated);
  };

  const updateBlockField = (index: number, field: string, val: any) => {
    setActiveComponents((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: val } : item))
    );
  };

  const handleInsertVariable = (index: number) => {
    const block = activeComponents[index];
    if (block?.type !== "BODY") return;

    // Detect next variable index
    const matches = block.text?.match(/\{\{(\d+)\}\}/g) || [];
    const nextNum = matches.length + 1;
    const newText = (block.text || "") + ` {{${nextNum}}}`;
    updateBlockField(index, "text", newText);
  };

  const handleInsertFormatting = (index: number, wrapChar: string) => {
    const block = activeComponents[index];
    if (block?.type !== "BODY") return;
    const newText = (block.text || "") + ` ${wrapChar}sample${wrapChar} `;
    updateBlockField(index, "text", newText);
  };

  const handleCreateTemplate = async () => {
    const cleanName = builderName.trim().toLowerCase().replace(/[\s\-]+/g, "_");
    if (!cleanName) {
      message.error("Please enter a valid template name");
      return;
    }

    const bodyBlock = activeComponents.find((c) => c.type === "BODY");
    if (!bodyBlock || !bodyBlock.text || bodyBlock.text.trim().length === 0) {
      message.error("Template requires a non-empty Body text component");
      return;
    }

    // Build components structure
    const componentsToSubmit = activeComponents.map((c) => {
      if (c.type === "BODY") {
        const varMatches = c.text?.match(/\{\{(\d+)\}\}/g) || [];
        const sampleValues = varMatches.map((_, i) => `Sample_${i + 1}`);
        return {
          type: "BODY",
          text: c.text,
          ...(varMatches.length > 0 ? { example: { body_text: [sampleValues] } } : {}),
        };
      }
      if (c.type === "HEADER") {
        return {
          type: "HEADER",
          format: c.format || "TEXT",
          ...(c.format === "TEXT" ? { text: c.text } : {}),
        };
      }
      return c;
    });

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/meta/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          category: builderCategory,
          language: builderLanguage,
          components: componentsToSubmit,
        }),
      });

      const json = await res.json();
      if (json.success) {
        message.success(`Template ${cleanName} submitted successfully!`);
        setIsBuilderOpen(false);
        setBuilderName("");
        fetchTemplates();
      } else {
        message.error(json.error?.message || "Failed to submit template to Meta");
      }
    } catch (err: any) {
      message.error(err.message || "Failed to create template");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "ALL" || t.status.toUpperCase() === statusFilter.toUpperCase();
    const matchesCategory =
      categoryFilter === "ALL" || t.category.toUpperCase() === categoryFilter.toUpperCase();
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const originUrl = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com";

  const getTemplateCurlExample = (tpl: TemplateItem) => {
    return `curl -X POST "${originUrl}/api/v1/messages" \\
  -H "Authorization: Bearer <YOUR_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+15551234567",
    "type": "template",
    "template": {
      "name": "${tpl.name}",
      "language": "${tpl.language || "en_US"}"
    }
  }'`;
  };

  const copyCurlToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
    message.success("Copied cURL to clipboard!");
  };

  const columns = [
    {
      title: "Template Name & Category",
      key: "name",
      render: (_: unknown, t: TemplateItem) => (
        <div>
          <div style={{ fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
            <FileText size={15} color="var(--brand)" />
            <code>{t.name}</code>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Tag color="cyan" style={{ fontSize: 10, margin: 0, textTransform: "uppercase" }}>
              {t.category}
            </Tag>
            <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--muted)" }}>
              {t.language}
            </span>
          </div>
        </div>
      ),
    },
    {
      title: "Components Summary",
      key: "components",
      render: (_: unknown, t: TemplateItem) => {
        const hasHeader = t.components?.some((c) => c.type === "HEADER");
        const hasBody = t.components?.some((c) => c.type === "BODY");
        const hasFooter = t.components?.some((c) => c.type === "FOOTER");
        const buttonsComp = t.components?.find((c) => c.type === "BUTTONS");
        const buttonCount = buttonsComp?.buttons?.length || 0;

        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {hasHeader && <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>Header</Tag>}
            {hasBody && <Tag color="green" style={{ fontSize: 11, margin: 0 }}>Body</Tag>}
            {hasFooter && <Tag color="default" style={{ fontSize: 11, margin: 0 }}>Footer</Tag>}
            {buttonCount > 0 && (
              <Tag color="purple" style={{ fontSize: 11, margin: 0 }}>
                {buttonCount} Button{buttonCount > 1 ? "s" : ""}
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: string) => {
        let color = "success";
        const st = (status || "").toUpperCase();
        if (st === "PENDING") color = "warning";
        else if (st === "REJECTED") color = "error";
        else if (st === "PAUSED") color = "default";

        return (
          <Tag color={color} style={{ fontSize: 11, fontFamily: "monospace", textTransform: "uppercase" }}>
            {status}
          </Tag>
        );
      },
    },
    {
      title: "Actions",
      key: "actions",
      width: 220,
      render: (_: unknown, t: TemplateItem) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Tooltip title="Preview in WhatsApp phone simulator">
            <Button
              size="small"
              type="text"
              icon={<Eye size={13} />}
              onClick={() => setPreviewTemplate(t)}
              style={{ color: "var(--brand)" }}
            >
              Preview
            </Button>
          </Tooltip>
          <Tooltip title="View cURL payload to send this template">
            <Button
              size="small"
              type="text"
              icon={<Terminal size={13} />}
              onClick={() => setCurlTemplate(t)}
              style={{ color: "var(--text)" }}
            >
              cURL
            </Button>
          </Tooltip>
          <Popconfirm
            title="Delete Template"
            description={`Are you sure you want to delete "${t.name}"?`}
            onConfirm={() => handleDelete(t.name)}
            okText="Yes, Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger type="text" icon={<Trash2 size={13} />}>
              Delete
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  // Helper for rendering WhatsApp Chat Bubble in Phone Simulator
  const renderPhoneSimulator = (components: TemplateComponent[]) => {
    const headerComp = components.find((c) => c.type === "HEADER");
    const bodyComp = components.find((c) => c.type === "BODY");
    const footerComp = components.find((c) => c.type === "FOOTER");
    const buttonsComp = components.find((c) => c.type === "BUTTONS");

    // Format body text with variable highlights
    const formatBodyText = (text: string) => {
      if (!text) return "Message body text...";
      const parts = text.split(/(\{\{\d+\}\})/g);
      return parts.map((part, i) => {
        if (/^\{\{\d+\}\}$/.test(part)) {
          return (
            <span key={i} className={styles.bubbleParam}>
              {part}
            </span>
          );
        }
        return part;
      });
    };

    return (
      <div className={styles.phoneFrame}>
        {/* WhatsApp Chat Header */}
        <div className={styles.phoneHeader}>
          <div className={styles.phoneHeaderUser}>
            <div className={styles.phoneAvatar}>WA</div>
            <div className={styles.phoneUserInfo}>
              <span className={styles.phoneUserName}>
                WhatsApp Engine <Check size={12} color="#00a884" />
              </span>
              <span className={styles.phoneUserStatus}>Verified Business Account</span>
            </div>
          </div>
        </div>

        {/* WhatsApp Chat Body */}
        <div className={styles.phoneChatBody}>
          <div className={styles.bubbleContainer}>
            {/* The Green Bubble */}
            <div className={styles.waBubble}>
              {/* Header */}
              {headerComp && headerComp.format === "TEXT" && (
                <div className={styles.bubbleHeaderText}>{headerComp.text || "Header Title"}</div>
              )}
              {headerComp && headerComp.format && headerComp.format !== "TEXT" && (
                <div className={styles.bubbleHeaderMedia}>
                  <span>[Media: {headerComp.format}]</span>
                </div>
              )}

              {/* Body */}
              <div className={styles.bubbleBody}>
                {formatBodyText(bodyComp?.text || "")}
              </div>

              {/* Footer */}
              {footerComp && footerComp.text && (
                <div className={styles.bubbleFooter}>{footerComp.text}</div>
              )}

              {/* Bubble Metadata (Time + Read Ticks) */}
              <div className={styles.bubbleMeta}>
                <span>12:45 PM</span>
                <Check size={12} color="#53bdeb" />
              </div>
            </div>

            {/* Interactive Buttons underneath bubble */}
            {buttonsComp && buttonsComp.buttons && buttonsComp.buttons.length > 0 && (
              <div className={styles.bubbleButtonsList}>
                {buttonsComp.buttons.map((btn, i) => (
                  <div key={i} className={styles.bubbleButton}>
                    {btn.type === "URL" && <ExternalLink size={13} />}
                    {btn.type === "PHONE_NUMBER" && <Phone size={13} />}
                    {btn.type === "QUICK_REPLY" && <MousePointerClick size={13} />}
                    <span>{btn.text || `Button ${i + 1}`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {/* Top Banner */}
      <div className={`glass-strong ${styles.topBar}`}>
        <div className={styles.headerText}>
          <h2 className={styles.title}>Message Templates</h2>
          <p className={styles.subtitle}>
            Design, preview, and manage official Meta WhatsApp templates. Build custom high-converting templates with interactive drag-and-drop components.
          </p>
        </div>
        <div className={styles.actionButtonGroup}>
          <Button
            icon={<RefreshCw size={14} className={loading ? "animate-spin" : ""} />}
            onClick={fetchTemplates}
            className="btn-secondary"
            style={{ padding: "8px 14px", height: "auto" }}
          >
            Sync with Meta
          </Button>
          <button
            onClick={() => setIsBuilderOpen(true)}
            className="btn-primary"
            style={{ padding: "8px 18px", fontSize: 13 }}
          >
            <Plus size={16} />
            <span>Create Template</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className={`glass ${styles.filterRow}`}>
        <div className={styles.searchBox}>
          <Input
            placeholder="Search templates by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            allowClear
            className="glass-input"
          />
        </div>
        <div className={styles.filtersGroup}>
          <Select
            value={categoryFilter}
            onChange={setCategoryFilter}
            style={{ width: 140 }}
            options={[
              { label: "All Categories", value: "ALL" },
              { label: "Utility", value: "UTILITY" },
              { label: "Marketing", value: "MARKETING" },
              { label: "Authentication", value: "AUTHENTICATION" },
            ]}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 130 }}
            options={[
              { label: "All Statuses", value: "ALL" },
              { label: "Approved", value: "APPROVED" },
              { label: "Pending", value: "PENDING" },
              { label: "Rejected", value: "REJECTED" },
            ]}
          />
        </div>
      </div>

      {/* Templates Table */}
      <div className={`glass ${styles.tableWrapper}`}>
        <Table
          columns={columns}
          dataSource={filteredTemplates}
          rowKey="name"
          loading={loading}
          scroll={{ x: 800 }}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* ============================================================
          DRAG & DROP TEMPLATE CREATOR MODAL
         ============================================================ */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--brand)", fontWeight: 700 }}>
            <Layers size={18} /> Visual Template Builder
          </div>
        }
        open={isBuilderOpen}
        onCancel={() => setIsBuilderOpen(false)}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, padding: "10px 0" }}>
            <Button onClick={() => setIsBuilderOpen(false)}>Cancel</Button>
            <Button
              type="primary"
              loading={submitting}
              onClick={handleCreateTemplate}
              style={{ backgroundColor: "var(--brand)" }}
            >
              Submit Template to Meta
            </Button>
          </div>
        }
        width={1060}
        destroyOnClose
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 12 }}>
          {/* Metadata Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr 1fr",
              gap: 12,
              padding: "14px 18px",
              borderRadius: 14,
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid var(--stroke)",
            }}
          >
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
                Template Name:
              </label>
              <Input
                placeholder="e.g. order_shipped_v1"
                value={builderName}
                onChange={(e) => setBuilderName(e.target.value.toLowerCase().replace(/[\s\-]+/g, "_"))}
                style={{ marginTop: 4, fontFamily: "monospace" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
                Category:
              </label>
              <Select
                value={builderCategory}
                onChange={setBuilderCategory}
                style={{ width: "100%", marginTop: 4 }}
                options={[
                  { label: "Utility (Transactional / Notifications)", value: "UTILITY" },
                  { label: "Marketing (Promotions / Offers)", value: "MARKETING" },
                  { label: "Authentication (OTPs / Passcodes)", value: "AUTHENTICATION" },
                ]}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
                Language:
              </label>
              <Select
                value={builderLanguage}
                onChange={setBuilderLanguage}
                style={{ width: "100%", marginTop: 4 }}
                options={[
                  { label: "English (US) - en_US", value: "en_US" },
                  { label: "English (UK) - en_GB", value: "en_GB" },
                  { label: "Spanish - es_ES", value: "es_ES" },
                  { label: "Portuguese (BR) - pt_BR", value: "pt_BR" },
                  { label: "Hindi - hi_IN", value: "hi_IN" },
                ]}
              />
            </div>
          </div>

          {/* Builder Split Layout */}
          <div className={styles.builderLayout}>
            {/* Left Column: Palette & Canvas */}
            <div className={styles.canvasArea}>
              {/* Draggable Component Palette */}
              <div className={styles.paletteSection}>
                <div className={styles.paletteHeader}>
                  <span className={styles.paletteTitle}>Drag or Click to Add Components</span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>Click or drag into the canvas</span>
                </div>
                <div className={styles.paletteGrid}>
                  {/* Header Item */}
                  <div
                    className={styles.paletteCard}
                    draggable
                    onDragStart={(e) => handleDragStart(e, "HEADER")}
                    onClick={() => addComponentBlock("HEADER")}
                  >
                    <div className={styles.paletteCardIcon}>
                      <Heading size={18} />
                    </div>
                    <span className={styles.paletteCardLabel}>Header</span>
                    <span className={styles.paletteCardDesc}>Text or Media banner</span>
                  </div>

                  {/* Body Item */}
                  <div
                    className={styles.paletteCard}
                    draggable
                    onDragStart={(e) => handleDragStart(e, "BODY")}
                    onClick={() => addComponentBlock("BODY")}
                  >
                    <div className={styles.paletteCardIcon}>
                      <MessageSquare size={18} />
                    </div>
                    <span className={styles.paletteCardLabel}>Body Text</span>
                    <span className={styles.paletteCardDesc}>Message text & variables</span>
                  </div>

                  {/* Footer Item */}
                  <div
                    className={styles.paletteCard}
                    draggable
                    onDragStart={(e) => handleDragStart(e, "FOOTER")}
                    onClick={() => addComponentBlock("FOOTER")}
                  >
                    <div className={styles.paletteCardIcon}>
                      <Bookmark size={18} />
                    </div>
                    <span className={styles.paletteCardLabel}>Footer</span>
                    <span className={styles.paletteCardDesc}>Small disclaimer subtext</span>
                  </div>

                  {/* Buttons Item */}
                  <div
                    className={styles.paletteCard}
                    draggable
                    onDragStart={(e) => handleDragStart(e, "BUTTONS")}
                    onClick={() => addComponentBlock("BUTTONS")}
                  >
                    <div className={styles.paletteCardIcon}>
                      <MousePointerClick size={18} />
                    </div>
                    <span className={styles.paletteCardLabel}>Buttons</span>
                    <span className={styles.paletteCardDesc}>Quick replies & URLs</span>
                  </div>
                </div>
              </div>

              {/* Canvas Dropzone */}
              <div
                className={`${styles.dropzone} ${isDragOver ? styles.dropzoneActive : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const type = e.dataTransfer.getData("componentType") as PaletteComponentType;
                  if (type) addComponentBlock(type);
                }}
              >
                {activeComponents.length === 0 && (
                  <div className={styles.emptyDropzoneNotice}>
                    <Layers size={32} color="var(--brand)" />
                    <div style={{ fontWeight: 600 }}>Your Canvas is Empty</div>
                    <div style={{ fontSize: 12 }}>
                      Drag and drop components from the palette above into this workspace to build your template.
                    </div>
                  </div>
                )}

                {activeComponents.map((comp, index) => (
                  <div key={index} className={styles.canvasBlock}>
                    {/* Block Header */}
                    <div className={styles.canvasBlockHeader}>
                      <div className={styles.blockTitleGroup}>
                        <div className={styles.dragHandle}>
                          <GripVertical size={16} />
                        </div>
                        <span className={styles.blockTitle}>{comp.type}</span>
                        <span className={styles.blockBadge}>Component #{index + 1}</span>
                      </div>

                      <div className={styles.blockActions}>
                        <button
                          type="button"
                          className={styles.actionIconBtn}
                          disabled={index === 0}
                          onClick={() => moveComponentBlock(index, "up")}
                          title="Move Up"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          className={styles.actionIconBtn}
                          disabled={index === activeComponents.length - 1}
                          onClick={() => moveComponentBlock(index, "down")}
                          title="Move Down"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionIconBtn} ${styles.deleteIconBtn}`}
                          onClick={() => removeComponentBlock(index)}
                          title="Remove block"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Block Contents */}
                    {comp.type === "HEADER" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", gap: 10 }}>
                          <Select
                            value={comp.format || "TEXT"}
                            onChange={(val) => updateBlockField(index, "format", val)}
                            style={{ width: 140 }}
                            options={[
                              { label: "Text Header", value: "TEXT" },
                              { label: "Image Header", value: "IMAGE" },
                              { label: "Video Header", value: "VIDEO" },
                              { label: "Document", value: "DOCUMENT" },
                            ]}
                          />
                          {comp.format === "TEXT" && (
                            <Input
                              placeholder="Header headline (e.g. Order Confirmed)"
                              value={comp.text || ""}
                              onChange={(e) => updateBlockField(index, "text", e.target.value)}
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {comp.type === "BODY" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {/* Formatting toolbar */}
                        <div className={styles.formatToolbar}>
                          <button
                            type="button"
                            className={`${styles.toolbarBtn} ${styles.varInsertBtn}`}
                            onClick={() => handleInsertVariable(index)}
                          >
                            + Add Variable ({"{{1}}"})
                          </button>
                          <button
                            type="button"
                            className={styles.toolbarBtn}
                            onClick={() => handleInsertFormatting(index, "*")}
                          >
                            *Bold*
                          </button>
                          <button
                            type="button"
                            className={styles.toolbarBtn}
                            onClick={() => handleInsertFormatting(index, "_")}
                          >
                            _Italic_
                          </button>
                          <button
                            type="button"
                            className={styles.toolbarBtn}
                            onClick={() => handleInsertFormatting(index, "`")}
                          >
                            `Code`
                          </button>
                        </div>

                        <Input.TextArea
                          rows={4}
                          placeholder="Write your WhatsApp message text here... Use variables like {{1}}, {{2}} for dynamic content."
                          value={comp.text || ""}
                          onChange={(e) => updateBlockField(index, "text", e.target.value)}
                          maxLength={1024}
                          showCount
                        />
                      </div>
                    )}

                    {comp.type === "FOOTER" && (
                      <Input
                        placeholder="e.g. Reply STOP to unsubscribe (Max 60 chars)"
                        maxLength={60}
                        value={comp.text || ""}
                        onChange={(e) => updateBlockField(index, "text", e.target.value)}
                        showCount
                      />
                    )}

                    {comp.type === "BUTTONS" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div className={styles.buttonList}>
                          {(comp.buttons || []).map((btn, btnIdx) => (
                            <div key={btnIdx} className={styles.buttonItemRow}>
                              <Select
                                value={btn.type}
                                onChange={(typeVal) => {
                                  const updated = [...(comp.buttons || [])];
                                  updated[btnIdx] = { ...updated[btnIdx], type: typeVal };
                                  updateBlockField(index, "buttons", updated);
                                }}
                                options={[
                                  { label: "Quick Reply", value: "QUICK_REPLY" },
                                  { label: "Visit Website", value: "URL" },
                                  { label: "Call Phone", value: "PHONE_NUMBER" },
                                ]}
                              />
                              <Input
                                placeholder="Button Text (e.g. Track Order)"
                                value={btn.text}
                                onChange={(e) => {
                                  const updated = [...(comp.buttons || [])];
                                  updated[btnIdx] = { ...updated[btnIdx], text: e.target.value };
                                  updateBlockField(index, "buttons", updated);
                                }}
                              />
                              <button
                                type="button"
                                className={`${styles.actionIconBtn} ${styles.deleteIconBtn}`}
                                onClick={() => {
                                  const updated = (comp.buttons || []).filter((_, bi) => bi !== btnIdx);
                                  updateBlockField(index, "buttons", updated);
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>

                        {(comp.buttons || []).length < 3 && (
                          <Button
                            size="small"
                            type="dashed"
                            onClick={() => {
                              const updated = [
                                ...(comp.buttons || []),
                                { type: "QUICK_REPLY" as const, text: `Action ${(comp.buttons?.length || 0) + 1}` },
                              ];
                              updateBlockField(index, "buttons", updated);
                            }}
                            icon={<Plus size={12} />}
                            style={{ alignSelf: "flex-start" }}
                          >
                            Add Button
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Live Phone Simulator */}
            <div className={styles.previewArea}>
              <span className={styles.previewLabel}>Live WhatsApp Preview</span>
              {renderPhoneSimulator(activeComponents)}
            </div>
          </div>
        </div>
      </Modal>

      {/* ============================================================
          QUICK PREVIEW MODAL
         ============================================================ */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--brand)", fontWeight: 700 }}>
            <Eye size={18} /> WhatsApp Preview: {previewTemplate?.name}
          </div>
        }
        open={Boolean(previewTemplate)}
        onCancel={() => setPreviewTemplate(null)}
        footer={null}
        width={420}
        destroyOnClose
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
          {previewTemplate && renderPhoneSimulator(previewTemplate.components)}
        </div>
      </Modal>

      {/* ============================================================
          cURL CODE MODAL
         ============================================================ */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--brand)", fontWeight: 700 }}>
            <Terminal size={18} /> Dispatch Template via API
          </div>
        }
        open={Boolean(curlTemplate)}
        onCancel={() => setCurlTemplate(null)}
        footer={null}
        width={640}
        destroyOnClose
      >
        {curlTemplate && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
              Use your API Key to dispatch this template message via the WhatsApp Engine public API:
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                size="small"
                icon={copiedCurl ? <Check size={12} /> : <Copy size={12} />}
                onClick={() => copyCurlToClipboard(getTemplateCurlExample(curlTemplate))}
              >
                {copiedCurl ? "Copied" : "Copy cURL"}
              </Button>
            </div>
            <pre className={styles.codeBlock}>{getTemplateCurlExample(curlTemplate)}</pre>
          </div>
        )}
      </Modal>
    </div>
  );
}
