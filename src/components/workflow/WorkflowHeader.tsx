"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, ChevronDown, Copy, ClipboardPaste, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { validateGraph } from "@/server/workflows/validation";
import { WorkflowGraph } from "@/server/workflows/types";
import { Modal, Dropdown, MenuProps, message } from "antd";

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
  onSelectNode?: (nodeId: string) => void;
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
  onSelectNode,
}: WorkflowHeaderProps) {
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(name);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // Pre-publish validation check
  const validationResult = validateGraph(graph);
  const errorCount = validationResult.errors.length;

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
        window.location.href = `/workflow/${json.data.id}`;
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
    if (!validationResult.valid) {
      setShowValidationModal(true);
      // Select first failing node if found
      const firstError = validationResult.errors[0];
      const match = firstError?.match(/Node "([^"]+)"/);
      if (match && onSelectNode) {
        onSelectNode(match[1]);
      }
      return;
    }

    try {
      await onPublish();
      message.success("Agent published and activated successfully!");
    } catch (err: any) {
      message.error(err.message || "Publish failed.");
    }
  };

  const handleIssueBadgeClick = () => {
    if (errorCount > 0) {
      setShowValidationModal(true);
      const firstError = validationResult.errors[0];
      const match = firstError?.match(/Node "([^"]+)"/);
      if (match && onSelectNode) {
        onSelectNode(match[1]);
      }
    }
  };

  const editMenuItems: MenuProps["items"] = [
    {
      key: "copy",
      label: (
        <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
          <Copy size={14} /> Copy Selection <span style={{ marginLeft: "auto", color: "#98a2b3", fontSize: "11px" }}>Ctrl+C</span>
        </span>
      ),
      onClick: onCopySelection,
      disabled: !hasSelection,
    },
    {
      key: "paste",
      label: (
        <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
          <ClipboardPaste size={14} /> Paste from Clipboard <span style={{ marginLeft: "auto", color: "#98a2b3", fontSize: "11px" }}>Ctrl+V</span>
        </span>
      ),
      onClick: onPasteClipboard,
      disabled: !hasClipboard,
    },
    {
      type: "divider",
    },
    {
      key: "duplicate",
      label: (
        <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
          <Copy size={14} /> Duplicate Agent
        </span>
      ),
      onClick: handleDuplicateClick,
      disabled: duplicating,
    },
  ];

  return (
    <header
      style={{
        height: "64px",
        minHeight: "64px",
        background: "#ffffff",
        borderBottom: "1px solid #eaecf0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        zIndex: 20,
        boxSizing: "border-box",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Left: Back Button, Name, Version, Issues Badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
        <Link
          href="/workflow"
          title="Back to agents list"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "44px",
            height: "44px",
            borderRadius: "8px",
            border: "1px solid #d0d5dd",
            background: "#ffffff",
            color: "#344054",
            textDecoration: "none",
            transition: "all 0.15s ease",
            outline: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
        >
          <ArrowLeft size={18} />
        </Link>

        {/* Agent Name */}
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
              } else if (e.key === "Escape") {
                setEditingName(false);
                setTempName(name);
              }
            }}
            style={{
              fontSize: "18px",
              fontWeight: 700,
              padding: "4px 8px",
              borderRadius: "6px",
              border: "1.5px solid #10b981",
              outline: "none",
              color: "#101828",
              maxWidth: "280px",
            }}
          />
        ) : (
          <h1
            onClick={() => {
              setTempName(name);
              setEditingName(true);
            }}
            title="Click to rename agent"
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#101828",
              margin: 0,
              cursor: "pointer",
              padding: "4px 6px",
              borderRadius: "6px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "260px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f4f3ff")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {name || "Untitled Agent"}
          </h1>
        )}

        {/* Version dropdown */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "13px",
            fontWeight: 500,
            color: "#475467",
            padding: "4px 8px",
            borderRadius: "6px",
            cursor: "default",
          }}
        >
          <span>v{version} · {status === "active" ? "Active" : "Draft"}</span>
          <ChevronDown size={14} color="#98a2b3" />
        </div>

        {/* Issues Badge */}
        {errorCount > 0 ? (
          <button
            type="button"
            onClick={handleIssueBadgeClick}
            title={`${errorCount} validation issue${errorCount > 1 ? "s" : ""} detected. Click to inspect.`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              minHeight: "32px",
              borderRadius: "16px",
              background: "#fee4e2",
              border: "1px solid #fecdca",
              color: "#b42318",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              outline: "none",
            }}
          >
            <AlertCircle size={14} color="#d92d20" />
            <span>{errorCount} issue{errorCount > 1 ? "s" : ""}</span>
          </button>
        ) : (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 10px",
              borderRadius: "16px",
              background: "#ecfdf3",
              border: "1px solid #abefc6",
              color: "#067647",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={13} color="#067647" />
            <span>Valid</span>
          </div>
        )}
      </div>

      {/* Right Action Buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {/* Agent Runs */}
        <Link
          href={`/workflow/${workflowId}/runs`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            minHeight: "44px",
            padding: "0 14px",
            borderRadius: "8px",
            border: "1px solid #d0d5dd",
            background: "#ffffff",
            color: "#344054",
            fontSize: "13px",
            fontWeight: 600,
            textDecoration: "none",
            transition: "all 0.15s ease",
            outline: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
        >
          <span>Agent Runs</span>
        </Link>

        {/* Edit Dropdown */}
        <Dropdown menu={{ items: editMenuItems }} trigger={["click"]}>
          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              minHeight: "44px",
              padding: "0 14px",
              borderRadius: "8px",
              border: "1px solid #d0d5dd",
              background: "#ffffff",
              color: "#344054",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
              outline: "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
          >
            <span>Edit</span>
            <ChevronDown size={14} color="#667085" />
          </button>
        </Dropdown>

        {/* Save Button */}
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={saving}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            minHeight: "44px",
            padding: "0 16px",
            borderRadius: "8px",
            border: "1px solid #d0d5dd",
            background: "#ffffff",
            color: "#344054",
            fontSize: "13px",
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
            outline: "none",
          }}
          onMouseEnter={(e) => {
            if (!saving) e.currentTarget.style.background = "#f9fafb";
          }}
          onMouseLeave={(e) => {
            if (!saving) e.currentTarget.style.background = "#ffffff";
          }}
        >
          <Save size={15} />
          <span>{saving ? "Saving..." : "Save"}</span>
        </button>

        {/* Publish Button */}
        <button
          type="button"
          onClick={handlePublishClick}
          disabled={publishing}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            minHeight: "44px",
            padding: "0 18px",
            borderRadius: "8px",
            border: "none",
            background: "#047857",
            color: "#ffffff",
            fontSize: "13px",
            fontWeight: 600,
            cursor: publishing ? "not-allowed" : "pointer",
            opacity: publishing ? 0.7 : 1,
            boxShadow: "0 1px 2px rgba(16, 24, 40, 0.05)",
            outline: "none",
          }}
          onMouseEnter={(e) => {
            if (!publishing) e.currentTarget.style.background = "#065f46";
          }}
          onMouseLeave={(e) => {
            if (!publishing) e.currentTarget.style.background = "#047857";
          }}
        >
          <span>{publishing ? "Publishing..." : "Publish"}</span>
        </button>
      </div>

      {/* Validation Issues Modal */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#b42318" }}>
            <AlertCircle size={18} />
            <span style={{ fontWeight: 700 }}>Workflow Validation Issues ({errorCount})</span>
          </div>
        }
        open={showValidationModal}
        onCancel={() => setShowValidationModal(false)}
        footer={[
          <button
            key="close"
            type="button"
            onClick={() => setShowValidationModal(false)}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid #d0d5dd",
              background: "#ffffff",
              color: "#344054",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close
          </button>,
        ]}
      >
        <p style={{ fontSize: "13px", color: "#475467", marginTop: "8px" }}>
          Resolve the structural and node configuration issues before publishing:
        </p>
        <div style={{ maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
          {validationResult.errors.map((err, idx) => {
            const match = err.match(/Node "([^"]+)"/);
            const targetNodeId = match ? match[1] : null;

            return (
              <div
                key={idx}
                onClick={() => {
                  if (targetNodeId && onSelectNode) {
                    onSelectNode(targetNodeId);
                    setShowValidationModal(false);
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "#fef3f2",
                  border: "1px solid #fee4e2",
                  cursor: targetNodeId ? "pointer" : "default",
                }}
              >
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#d92d20", marginTop: "6px", flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: "12.5px", color: "#b42318", lineHeight: "1.4" }}>
                  {err}
                  {targetNodeId && (
                    <div style={{ fontSize: "11px", color: "#047857", fontWeight: 600, marginTop: "4px" }}>
                      Click to jump to this step →
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </header>
  );
}
