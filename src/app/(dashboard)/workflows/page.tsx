"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Pencil,
  Eye,
  RotateCcw,
  Trash2,
  Workflow,
  Bot,
  MessageSquare,
  Sparkles,
  Layers,
  Radio,
  HelpCircle,
  Globe,
  Copy,
  AlertTriangle,
} from "lucide-react";
import { STARTER_TEMPLATES } from "@/server/workflows/starterTemplates";
import { Modal, Select, message } from "antd";
import styles from "./workflows.module.css";
import { WorkflowPreviewModal } from "@/components/workflows/WorkflowPreviewModal";

interface WorkflowItem {
  id: string;
  project_id: string;
  phone_number_id: string | null;
  name: string;
  trigger_type: string;
  trigger_value: string | null;
  priority: number;
  status: "draft" | "active" | "archived";
  version: number;
  updated_at: string;
}

interface Project {
  projectId: string;
  name: string;
}

function getWorkflowIcon(triggerType: string) {
  if (triggerType === "keyword") return <Radio size={20} color="#175cd3" />;
  if (triggerType === "first_message") return <MessageSquare size={20} color="#175cd3" />;
  return <Bot size={20} color="#175cd3" />;
}

export default function WorkflowsListPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Create Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("blank");
  const [creating, setCreating] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // Generate with AI Modal
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [generateMode, setGenerateMode] = useState<"prompt" | "template">("prompt");
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [generateName, setGenerateName] = useState("");
  const [generateTemplateId, setGenerateTemplateId] = useState<string>(STARTER_TEMPLATES[0]?.id || "appointments");
  const [generateParams, setGenerateParams] = useState({
    businessName: "",
    triggerKeyword: "",
    supportEmail: "",
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationErrors, setGenerationErrors] = useState<string[]>([]);

  // Preview Modal
  const [previewWorkflow, setPreviewWorkflow] = useState<WorkflowItem | null>(null);

  // Soft Delete (Archive) Modal
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [workflowToDelete, setWorkflowToDelete] = useState<WorkflowItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchWorkflows = useCallback(async (projId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workflows?projectId=${projId}`);
      const json = await res.json();
      if (json.success) {
        setWorkflows(json.data || []);
      }
    } catch (err: any) {
      message.error(err.message || "Failed to load workflows.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/projects");
      const json = await res.json();
      if (json.success && json.data) {
        setProjects(json.data);
        if (json.data.length > 0) {
          setSelectedProjectId(json.data[0].projectId);
        }
      }
    } catch {
      setSelectedProjectId("default");
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (selectedProjectId) {
      fetchWorkflows(selectedProjectId);
    }
  }, [selectedProjectId, fetchWorkflows]);

  const handleCreateWorkflow = async () => {
    if (!newWorkflowName.trim()) {
      message.warning("Please enter a workflow name.");
      return;
    }

    setCreating(true);
    try {
      const body: any = {
        projectId: selectedProjectId,
        name: newWorkflowName.trim(),
      };

      if (selectedTemplateId !== "blank") {
        body.templateId = selectedTemplateId;
      }

      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (json.success && json.data?.id) {
        message.success("Agent created! Opening builder...");
        setIsModalOpen(false);
        setNewWorkflowName("");
        if (selectedProjectId) {
          fetchWorkflows(selectedProjectId);
        }
        router.push(`/workflows/${json.data.id}`);
      } else {
        message.error(json.error?.message || "Failed to create workflow.");
      }
    } catch (err: any) {
      message.error(err.message || "Error creating workflow.");
    } finally {
      setCreating(false);
    }
  };

  const openDeleteModal = (wf: WorkflowItem) => {
    setWorkflowToDelete(wf);
    setDeleteModalVisible(true);
  };

  const handleConfirmSoftDelete = async () => {
    if (!workflowToDelete) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/workflows/${workflowToDelete.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        message.success(`Workflow "${workflowToDelete.name}" archived successfully (soft deleted).`);
        setWorkflows((prev) => prev.filter((w) => w.id !== workflowToDelete.id));
        setDeleteModalVisible(false);
        setWorkflowToDelete(null);
      } else {
        message.error(json.error?.message || "Failed to archive workflow.");
      }
    } catch (err: any) {
      message.error(err.message || "Failed to archive workflow.");
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicateWorkflow = async (wf: WorkflowItem) => {
    setDuplicatingId(wf.id);
    try {
      const res = await fetch(`/api/workflows/${wf.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        message.success(`Duplicated "${wf.name}" as draft: "${json.data.name}"`);
        if (json.validation && !json.validation.valid) {
          message.warning({
            content: `Draft saved with validation notes: ${json.validation.errors.join(", ")}`,
            duration: 6,
          });
        }
        if (selectedProjectId) {
          fetchWorkflows(selectedProjectId);
        }
      } else {
        message.error(json.error?.message || "Failed to duplicate workflow.");
      }
    } catch (err: any) {
      message.error(err.message || "Network error while duplicating.");
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleGenerateWorkflow = async () => {
    setGenerationErrors([]);
    if (generateMode === "prompt" && !generatePrompt.trim()) {
      message.warning("Please enter a prompt describing what you want your WhatsApp agent to do.");
      return;
    }

    setIsGenerating(true);
    try {
      const payload: any = {
        mode: generateMode,
        projectId: selectedProjectId,
        name: generateName.trim() || undefined,
      };

      if (generateMode === "prompt") {
        payload.prompt = generatePrompt.trim();
      } else {
        payload.templateId = generateTemplateId;
        payload.parameters = {
          businessName: generateParams.businessName.trim(),
          triggerKeyword: generateParams.triggerKeyword.trim(),
          supportEmail: generateParams.supportEmail.trim(),
        };
      }

      const res = await fetch("/api/workflows/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        message.success(`Agent "${json.data.name}" generated as draft!`);
        setIsGenerateModalOpen(false);
        setGeneratePrompt("");
        setGenerateName("");
        if (selectedProjectId) {
          fetchWorkflows(selectedProjectId);
        }
        router.push(`/workflows/${json.data.id}`);
      } else {
        if (json.error?.validationErrors && Array.isArray(json.error.validationErrors)) {
          setGenerationErrors(json.error.validationErrors);
        }
        message.error(json.error?.message || "Failed to generate agent workflow.");
      }
    } catch (err: any) {
      message.error(err.message || "Network error while generating workflow.");
    } finally {
      setIsGenerating(false);
    }
  };

  const openPreviewModal = (wf: WorkflowItem) => {
    setPreviewWorkflow(wf);
  };

  const filteredWorkflows = workflows.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      (w.trigger_value || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={styles.container}>
      {/* Top Header */}
      <div className={styles.topBar}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Agent Management</h1>
          <p className={styles.subtitle}>
            Build, configure, and manage autonomous WhatsApp agents, conversational journeys, and webhook actions.
          </p>
        </div>

        <div className={styles.topActions}>
          <button
            type="button"
            onClick={() => {
              setGenerationErrors([]);
              setIsGenerateModalOpen(true);
            }}
            className={styles.suiteBtn}
            style={{
              borderColor: "#b2ccff",
              color: "#155eef",
              background: "#f5f8ff",
              fontWeight: 600,
            }}
          >
            <Sparkles size={15} color="#155eef" /> Generate with Groq
          </button>
          <button type="button" onClick={() => setIsModalOpen(true)} className={styles.createBtn}>
            <Plus size={16} /> Create Agent
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className={styles.filterBar}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "220px" }}>
          <Search size={16} color="#667085" />
          <input
            type="text"
            placeholder="Search agents by name or trigger keyword..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        {projects.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "#475467" }}>Project:</span>
            <Select
              value={selectedProjectId}
              onChange={(val) => setSelectedProjectId(val)}
              style={{ width: 190 }}
              options={projects.map((p) => ({ label: p.name, value: p.projectId }))}
            />
          </div>
        )}
      </div>

      {/* Agents Cards Container */}
      <div className={styles.listCard}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "64px 20px", color: "#475467" }}>
            <div style={{ fontSize: "14px", fontWeight: 600 }}>Loading agents...</div>
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 24px" }}>
            <div style={{ display: "inline-flex", padding: "14px", borderRadius: "16px", background: "#eff8ff", marginBottom: "14px" }}>
              <Bot size={32} color="#175cd3" />
            </div>
            <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#101828", margin: "0 0 6px 0" }}>
              No Agents Found
            </h3>
            <p style={{ fontSize: "13.5px", color: "#475467", maxWidth: "520px", margin: "0 auto 20px auto" }}>
              Build autonomous agents with interactive buttons, menus, calendars, questions, and APIs.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  setGenerationErrors([]);
                  setIsGenerateModalOpen(true);
                }}
                className={styles.suiteBtn}
                style={{
                  borderColor: "#b2ccff",
                  color: "#155eef",
                  background: "#f5f8ff",
                  fontWeight: 600,
                }}
              >
                <Sparkles size={15} color="#155eef" /> Generate with Groq
              </button>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className={styles.createBtn}
              >
                <Plus size={16} /> Create Agent
              </button>
            </div>
          </div>
        ) : (
          filteredWorkflows.map((wf) => {
            const isDraft = wf.status === "draft";
            const isActive = wf.status === "active";

            return (
              <div key={wf.id} className={styles.flowRow}>
                {/* Left: Icon Box + Details */}
                <div className={styles.leftInfo}>
                  <div className={styles.iconBox}>{getWorkflowIcon(wf.trigger_type)}</div>

                  <div className={styles.details}>
                    <div className={styles.headerLine}>
                      <span className={styles.name}>{wf.name}</span>

                      {/* Status Badges */}
                      {isActive && <span className={styles.activeBadge}>Active</span>}
                      {isDraft && <span className={styles.draftBadge}>Draft in progress</span>}

                      {isActive && wf.version > 1 && (
                        <span className={styles.draftBadge}>v{wf.version}</span>
                      )}
                    </div>

                    <p className={styles.desc}>
                      {wf.trigger_value
                        ? `Trigger: keyword "${wf.trigger_value}". Multi-step automated conversational journey.`
                        : `Trigger: ${wf.trigger_type.replace(/_/g, " ")}. Multi-step automated conversational journey.`}
                    </p>
                  </div>
                </div>

                {/* Right: 3 Outline Pill Action Buttons (Edit, Preview, Reset) */}
                <div className={styles.actionsGroup}>
                  <Link href={`/workflows/${wf.id}`} className={styles.pillBtn}>
                    <Pencil size={13} /> Edit
                  </Link>

                  <button
                    type="button"
                    onClick={() => openPreviewModal(wf)}
                    className={styles.pillBtn}
                  >
                    <Eye size={13} /> Preview
                  </button>

                  <button
                    type="button"
                    disabled={duplicatingId === wf.id}
                    onClick={() => handleDuplicateWorkflow(wf)}
                    className={styles.pillBtn}
                    title="Duplicate workflow as draft"
                  >
                    <Copy size={13} /> {duplicatingId === wf.id ? "Copying..." : "Duplicate"}
                  </button>

                  <Link href={`/workflows/${wf.id}/runs`} className={styles.pillBtn}>
                    <RotateCcw size={13} /> Reset
                  </Link>

                  <button
                    type="button"
                    onClick={() => openDeleteModal(wf)}
                    className={styles.deleteBtn}
                    title="Archive (Soft Delete) workflow"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Live Interactive WhatsApp Chat Preview Modal */}
      <WorkflowPreviewModal
        workflowId={previewWorkflow?.id || null}
        workflowName={previewWorkflow?.name}
        open={Boolean(previewWorkflow)}
        onClose={() => setPreviewWorkflow(null)}
      />

      {/* Create Agent Modal */}
      <Modal
        title="Create New Agent"
        open={isModalOpen}
        onOk={handleCreateWorkflow}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={creating}
        okText="Create & Open Builder"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "14px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px", color: "#101828" }}>
              Agent Name:
            </label>
            <input
              type="text"
              placeholder="e.g. Booking & Support Agent"
              value={newWorkflowName}
              onChange={(e) => setNewWorkflowName(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "8px",
                background: "#ffffff",
                border: "1px solid #d0d5dd",
                color: "#101828",
                fontSize: "13px",
                outline: "none",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px", color: "#101828" }}>
              Choose Starting Blueprint:
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "280px", overflowY: "auto" }}>
              <div
                onClick={() => setSelectedTemplateId("blank")}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: selectedTemplateId === "blank" ? "2px solid #0f9d7a" : "1px solid #eaecf0",
                  background: selectedTemplateId === "blank" ? "#f0fdf9" : "#ffffff",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "12.5px", color: "#101828" }}>Blank Flow</div>
                <div style={{ fontSize: "11.5px", color: "#475467" }}>Start with a simple Trigger ➔ Message ➔ End canvas.</div>
              </div>

              {STARTER_TEMPLATES.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedTemplateId(tpl.id)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: selectedTemplateId === tpl.id ? "2px solid #0f9d7a" : "1px solid #eaecf0",
                    background: selectedTemplateId === tpl.id ? "#f0fdf9" : "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: "12.5px", color: "#101828", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Sparkles size={13} color="#0f9d7a" />
                    {tpl.name}
                  </div>
                  <div style={{ fontSize: "11.5px", color: "#475467" }}>{tpl.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Generate Agent with Groq Modal */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#101828" }}>
            <Sparkles size={18} color="#155eef" />
            <span>Generate Agent with Groq</span>
          </div>
        }
        open={isGenerateModalOpen}
        onOk={handleGenerateWorkflow}
        onCancel={() => {
          if (!isGenerating) {
            setIsGenerateModalOpen(false);
            setGenerationErrors([]);
          }
        }}
        confirmLoading={isGenerating}
        okText={isGenerating ? "Validating & Building..." : "Generate & Open Studio"}
        width={620}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "14px" }}>
          {/* Mode Switcher Tabs */}
          <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #eaecf0", paddingBottom: "10px" }}>
            <button
              type="button"
              onClick={() => {
                setGenerateMode("prompt");
                setGenerationErrors([]);
              }}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
                border: generateMode === "prompt" ? "1.5px solid #155eef" : "1px solid #d0d5dd",
                background: generateMode === "prompt" ? "#eff8ff" : "#ffffff",
                color: generateMode === "prompt" ? "#155eef" : "#475467",
              }}
            >
              Groq AI Prompt
            </button>
            <button
              type="button"
              onClick={() => {
                setGenerateMode("template");
                setGenerationErrors([]);
              }}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
                border: generateMode === "template" ? "1.5px solid #155eef" : "1px solid #d0d5dd",
                background: generateMode === "template" ? "#eff8ff" : "#ffffff",
                color: generateMode === "template" ? "#155eef" : "#475467",
              }}
            >
              Customized Template
            </button>
          </div>

          {/* Validation Errors Alert Box */}
          {generationErrors.length > 0 && (
            <div
              style={{
                background: "#fef3f2",
                border: "1px solid #fecdca",
                borderRadius: "8px",
                padding: "12px 14px",
                fontSize: "12px",
                color: "#b42318",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>
                Graph Validation Failed (Not Saved to Drafts):
              </div>
              <ul style={{ margin: 0, paddingLeft: "18px" }}>
                {generationErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Mode 1: Prompt Mode */}
          {generateMode === "prompt" && (
            <>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px", color: "#101828" }}>
                  Prompt (Describe your WhatsApp conversation journey):
                </label>
                <textarea
                  rows={4}
                  placeholder="e.g. Create a patient appointment booking agent that asks for their preferred date using a calendar date picker, asks for their name and time slot, and confirms the visit."
                  value={generatePrompt}
                  onChange={(e) => setGeneratePrompt(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #d0d5dd",
                    fontSize: "13px",
                    outline: "none",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Inspiration Chips */}
              <div>
                <span style={{ fontSize: "11.5px", color: "#667085", display: "block", marginBottom: "6px" }}>
                  Quick Suggestions:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {[
                    {
                      label: "📅 Appointment Booking (Date Picker)",
                      text: "Create a medical clinic appointment booking agent that asks for patient name, preferred appointment date with calendar date picker, time slot buttons (morning, afternoon, evening), and confirms the booking.",
                    },
                    {
                      label: "⭐ Customer Feedback & Rating",
                      text: "Create a customer feedback survey agent that asks for a satisfaction rating using buttons (Great, Average, Poor), collects their comments via text, and thanks them.",
                    },
                    {
                      label: "📦 Order Status Tracking",
                      text: "Create an order tracking agent that asks customer for their order ID, looks it up via an API endpoint, and returns status with delivery date.",
                    },
                  ].map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setGeneratePrompt(chip.text)}
                      style={{
                        padding: "4px 8px",
                        fontSize: "11px",
                        borderRadius: "14px",
                        background: "#f2f4f7",
                        border: "1px solid #e4e7ec",
                        color: "#344054",
                        cursor: "pointer",
                      }}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Mode 2: Template Mode */}
          {generateMode === "template" && (
            <>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px", color: "#101828" }}>
                  Select Base Template:
                </label>
                <Select
                  value={generateTemplateId}
                  onChange={(val) => setGenerateTemplateId(val)}
                  style={{ width: "100%" }}
                  options={STARTER_TEMPLATES.map((t) => ({
                    label: `${t.name} — ${t.description.substring(0, 60)}...`,
                    value: t.id,
                  }))}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px", color: "#101828" }}>
                    Business / Clinic Name:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. City Health Clinic"
                    value={generateParams.businessName}
                    onChange={(e) => setGenerateParams({ ...generateParams, businessName: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: "1px solid #d0d5dd",
                      fontSize: "12.5px",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px", color: "#101828" }}>
                    Trigger Keywords:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BOOK, VISIT, CLINIC"
                    value={generateParams.triggerKeyword}
                    onChange={(e) => setGenerateParams({ ...generateParams, triggerKeyword: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: "1px solid #d0d5dd",
                      fontSize: "12.5px",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px", color: "#101828" }}>
                  Support Email or URL:
                </label>
                <input
                  type="text"
                  placeholder="e.g. support@cityhealth.com"
                  value={generateParams.supportEmail}
                  onChange={(e) => setGenerateParams({ ...generateParams, supportEmail: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid #d0d5dd",
                    fontSize: "12.5px",
                  }}
                />
              </div>
            </>
          )}

          {/* Optional Agent Name */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px", color: "#101828" }}>
              Agent Name (Optional):
            </label>
            <input
              type="text"
              placeholder="Leave blank to auto-generate from prompt or template"
              value={generateName}
              onChange={(e) => setGenerateName(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #d0d5dd",
                fontSize: "12.5px",
                outline: "none",
              }}
            />
          </div>
        </div>
      </Modal>

      {/* Soft Delete (Archive) Confirmation Modal */}
      <Modal
        title={null}
        open={deleteModalVisible}
        onCancel={() => {
          if (!deleting) {
            setDeleteModalVisible(false);
            setWorkflowToDelete(null);
          }
        }}
        footer={null}
        width={480}
        centered
      >
        <div style={{ padding: "8px 4px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "16px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                background: "#fee4e2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: "#d92d20",
              }}
            >
              <AlertTriangle size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#101828", margin: 0, marginBottom: "4px" }}>
                Archive Workflow
              </h3>
              <p style={{ fontSize: "13px", color: "#475467", margin: 0, lineHeight: 1.5 }}>
                Are you sure you want to soft delete <strong>&quot;{workflowToDelete?.name}&quot;</strong>?
              </p>
            </div>
          </div>

          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #eaecf0",
              borderRadius: "10px",
              padding: "12px 14px",
              marginBottom: "16px",
              fontSize: "12px",
              color: "#344054",
              lineHeight: 1.6,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ color: "#667085" }}>Current Status:</span>
              <span style={{ fontWeight: 600, textTransform: "capitalize" }}>
                {workflowToDelete?.status || "draft"} (v{workflowToDelete?.version || 1})
              </span>
            </div>
            {workflowToDelete?.trigger_value && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: "#667085" }}>Trigger Keywords:</span>
                <code style={{ background: "#f1f5f9", padding: "1px 6px", borderRadius: "4px" }}>
                  {workflowToDelete.trigger_value}
                </code>
              </div>
            )}
            <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #e2e8f0", color: "#64748b" }}>
              🛡️ <strong>Safe Soft Delete:</strong> This workflow will be moved to archived status. It will immediately stop responding to incoming WhatsApp messages, but all customer conversation history and analytics are safely preserved.
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                setDeleteModalVisible(false);
                setWorkflowToDelete(null);
              }}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid #d0d5dd",
                background: "#ffffff",
                color: "#344054",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleConfirmSoftDelete}
              style={{
                padding: "8px 18px",
                borderRadius: "8px",
                border: "1px solid #d92d20",
                background: "#d92d20",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 600,
                cursor: deleting ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                opacity: deleting ? 0.7 : 1,
              }}
            >
              <Trash2 size={14} />
              {deleting ? "Archiving..." : "Archive Workflow"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
