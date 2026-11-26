import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { MessageSquare } from "lucide-react";

export const MessageNode = memo(({ data, selected }: NodeProps) => {
  const text = (data.text as string) || "Enter message text...";
  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: "10px",
        background: "rgba(59, 130, 246, 0.12)",
        border: selected ? "2px solid #3b82f6" : "1px solid rgba(59, 130, 246, 0.4)",
        minWidth: "220px",
        maxWidth: "280px",
        boxShadow: selected ? "0 0 12px rgba(59, 130, 246, 0.3)" : "none",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#3b82f6", width: "10px", height: "10px" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <div
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "6px",
            background: "#3b82f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
          }}
        >
          <MessageSquare size={14} />
        </div>
        <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary, #fff)" }}>
          💬 Message
        </span>
      </div>
      <div
        style={{
          fontSize: "11px",
          color: "var(--text-secondary, #a1a1aa)",
          maxHeight: "48px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
        }}
      >
        {text}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="next"
        style={{ background: "#3b82f6", width: "10px", height: "10px" }}
      />
    </div>
  );
});

MessageNode.displayName = "MessageNode";
