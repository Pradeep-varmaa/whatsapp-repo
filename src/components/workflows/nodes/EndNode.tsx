import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Flag } from "lucide-react";

export const EndNode = memo(({ data, selected }: NodeProps) => {
  const text = (data.text as string) || "Workflow Completed";

  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: "10px",
        background: "rgba(107, 114, 128, 0.15)",
        border: selected ? "2px solid #9ca3af" : "1px solid rgba(107, 114, 128, 0.4)",
        minWidth: "200px",
        maxWidth: "260px",
        boxShadow: selected ? "0 0 12px rgba(156, 163, 175, 0.3)" : "none",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#9ca3af", width: "10px", height: "10px" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <div
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "6px",
            background: "#6b7280",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
          }}
        >
          <Flag size={14} />
        </div>
        <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary, #fff)" }}>
          🏁 End Flow
        </span>
      </div>
      {text && (
        <div style={{ fontSize: "11px", color: "var(--text-secondary, #9ca3af)" }}>
          {text}
        </div>
      )}
    </div>
  );
});

EndNode.displayName = "EndNode";
