"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, UploadCloud, History, AlertTriangle, HelpCircle, Copy, ClipboardPaste } from "lucide-react";
import { validateGraph } from "@/server/workflows/validation";
import { WorkflowGraph } from "@/server/workflows/types";
import { Modal, message } from "antd";

interface WorkflowHeaderProps {
  workflowId: string;
  name: string;
  version: number;
  status: "draft" | "active" | "archived";
  graph: WorkflowGraph;
  onSaveDraft: () => Promise<void>;
  onPublish: () => Promise<void>;
  onNameChange: (newName: string) => void;
  saving?: boolean;
  publishing?: boolean;
  onCopySelection?: () => void;
  onPasteClipboard?: () => void;
  hasSelection?: boolean;
  hasClipboard?: boolean;
}

export function WorkflowHeader({
  workflowId,
  name,
  version,
  status,
  graph,
  onSaveDraft,
  onPublish,
  onNameChange,
  saving = false,
  publishing = false,
  onCopySelection,
  onPasteClipboard,
  hasSelection = false,
  hasClipboard = false,
}: WorkflowHeaderProps) {
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(name);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const handleDuplicateClick = async () => {
    setDuplicating(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        message.success(`Workflow duplicated as draft: "${json.data.name}"`);
        if (json.validation && !json.validation.valid) {
          message.warning({
            content: `Draft saved with validation notes: ${json.validation.errors.join(", ")}`,
            duration: 6,
          });
        }
        window.location.href = `/workflows/${json.data.id}`;
      } else {
        message.error(json.error?.message || "Failed to duplicate workflow.");
      }
    } catch (err: any) {
      message.error(err.message || "Failed to duplicate workflow.");
    } finally {
      setDuplicating(false);
    }
  };

  const handlePublishClick = async () => {
    // Run pre-publish graph validation
    const result = validateGraph(graph);
    if (!result.valid) {
      setValidationErrors(result.errors);
      setShowValidationModal(true);
      return;
    }

    try {
      await onPublish();
      message.success("Agent published and activated successfully!");
    } catch (err: any) {
      message.error(err.message || "Publish failed.");
    }
  };

  const statusColors = {
    draft: { bg: "rgba(234, 179, 8, 0.15)", text: "#eab308", border: "#eab30844" },
    active: { bg: "rgba(16, 185, 129, 0.15)", text: "#10b981", border: "#10b98144" },
    archived: { bg: "rgba(107, 114, 128, 0.15)", text: "#9ca3af", border: "#9ca3af44" },
  };

  const currentTheme = statusColors[status] || statusColors.draft;

  return (
    <>
      <div
        style={{
          height: "56px",
          borderBottom: "1px solid var(--border, #27272a)",
          background: "var(--bg-card, #18181b)",
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 10,
        }}
      >
        {/* Left: Back & Title */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link
            href="/workflows"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              borderRadius: "6px",
              background: "var(--bg-card, #ffffff)",
              color: "var(--text-secondary, #475467)",
              border: "1px solid var(--border, #eaecf0)",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={16} />
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {editingName ? (
              <input
                type="text"
                value={tempName}
                autoFocus
                onChange={(e) => setTempName(e.target.value)}
                onBlur={() => {
                  setEditingName(false);
                  if (tempName.trim()) onNameChange(tempName.trim());
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setEditingName(false);
                    if (tempName.trim()) onNameChange(tempName.trim());
                  }
                }}
                style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "var(--text-primary, #101828)",
                  background: "var(--bg-card, #ffffff)",
                  border: "1px solid #10b981",
                  borderRadius: "4px",
                  padding: "2px 8px",
                }}
              />
            ) : (
              <span
                onClick={() => {
                  setTempName(name);
                  setEditingName(true);
                }}
                title="Click to rename"
                style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "var(--text-primary, #101828)",
                  cursor: "pointer",
                  borderBottom: "1px dashed var(--border, #eaecf0)",
                }}
              >
                {name}
              </span>
            )}

            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: "4px",
                background: "var(--border, #f2f4f7)",
                color: "var(--text-secondary, #475467)",
              }}
            >
              v{version}
            </span>

            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: "12px",
                background: currentTheme.bg,
                color: currentTheme.text,
                border: `1px solid ${currentTheme.border}`,
              }}
            >
              {status}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => setShowShortcuts(true)}
            title="Keyboard Shortcuts"
            style={{
              padding: "6px 8px",
              borderRadius: "6px",
              border: "1px solid var(--border, #eaecf0)",
              background: "var(--bg-card, #ffffff)",
              color: "var(--text-secondary, #475467)",
              fontSize: "11px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <HelpCircle size={14} /> Shortcuts
          </button>

          <Link
            href={`/workflows/${workflowId}/runs`}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid var(--border, #eaecf0)",
              background: "var(--bg-card, #ffffff)",
              color: "var(--text-primary, #101828)",
              fontSize: "12px",
              fontWeight: 500,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <History size={14} /> Agent Runs
          </Link>

          {/* Copy Button */}
          <button
            type="button"
            onClick={onCopySelection}
            title="Copy selected node(s) or flow to clipboard (Ctrl + C)"
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: hasSelection ? "1px solid #b2ccff" : "1px solid var(--border, #eaecf0)",
              background: hasSelection ? "#eff8ff" : "var(--bg-card, #ffffff)",
              color: hasSelection ? "#155eef" : "var(--text-primary, #101828)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <Copy size={13} color={hasSelection ? "#155eef" : "#475467"} />
            <span>Copy</span>
          </button>

          {/* Paste Button */}
          <button
            type="button"
            onClick={onPasteClipboard}
            title={
              hasClipboard
                ? "Paste copied design into canvas (Ctrl + V)"
                : "Clipboard is empty. Select nodes and click Copy first."
            }
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: hasClipboard ? "1px solid #10b981" : "1px solid var(--border, #eaecf0)",
              background: hasClipboard ? "#f0fdf9" : "var(--bg-card, #ffffff)",
              color: hasClipboard ? "#047857" : "var(--text-secondary, #98a2b3)",
              fontSize: "12px",
              fontWeight: hasClipboard ? 600 : 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <ClipboardPaste size={13} color={hasClipboard ? "#047857" : "#98a2b3"} />
            <span>Paste</span>
          </button>

          <button
            onClick={onSaveDraft}
            disabled={saving}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: "1px solid var(--border, #eaecf0)",
              background: "var(--bg-card, #ffffff)",
              color: "var(--text-primary, #101828)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Save size={14} /> {saving ? "Saving..." : "Save Agent"}
          </button>

          <button
            onClick={handlePublishClick}
            disabled={publishing}
            style={{
              padding: "6px 16px",
              borderRadius: "6px",
              border: "none",
              background: "#10b981",
              color: "#000",
              fontSize: "12px",
              fontWeight: 700,
              cursor: publishing ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
            }}
          >
            <UploadCloud size={15} /> {publishing ? "Publishing..." : "Publish Agent"}
          </button>
        </div>
      </div>

      {/* Validation Modal */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#ef4444" }}>
            <AlertTriangle size={18} /> Cannot Publish: Graph Validation Errors
          </div>
        }
        open={showValidationModal}
        onOk={() => setShowValidationModal(false)}
        onCancel={() => setShowValidationModal(false)}
        okText="Got It"
        cancelButtonProps={{ style: { display: "none" } }}
      >
        <p style={{ fontSize: "12px", color: "var(--text-secondary, #a1a1aa)" }}>
          The workflow graph must meet all structural requirements before it can be activated:
        </p>
        <ul style={{ paddingLeft: "20px", color: "#f87171", fontSize: "12px", lineHeight: "1.6" }}>
          {validationErrors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      </Modal>

      {/* Shortcuts Modal */}
      <Modal
        title="Keyboard Shortcuts & Canvas Operations"
        open={showShortcuts}
        onOk={() => setShowShortcuts(false)}
        onCancel={() => setShowShortcuts(false)}
        okText="Close"
        cancelButtonProps={{ style: { display: "none" } }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12.5px" }}>
          <div><code>Ctrl + C / Cmd + C</code> : Copy selected node(s) & connections to clipboard</div>
          <div><code>Ctrl + V / Cmd + V</code> : Paste design into this or another workflow</div>
          <div><code>Ctrl + A / Cmd + A</code> : Select all nodes on the canvas</div>
          <div><code>Shift + Click / Drag</code> : Select multiple nodes</div>
          <div><code>Delete / Backspace</code> : Delete selected node</div>
          <div><code>Ctrl + D</code> : Duplicate selected node</div>
          <div><code>Ctrl + Z</code> : Undo canvas changes</div>
          <div><code>Ctrl + Y</code> : Redo canvas changes</div>
          <div><code>Right-Click Canvas</code> : Quick-add nodes or paste design directly at pointer</div>
        </div>
      </Modal>
    </>
  );
}
