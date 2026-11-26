import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";

export const TriggerNode = memo(({ data, selected }: NodeProps) => {
  const keyword = data.keyword || "Any message";
  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: "10px",
        background: "rgba(234, 179, 8, 0.12)",
        border: selected ? "2px solid #eab308" : "1px solid rgba(234, 179, 8, 0.4)",
        minWidth: "200px",
        boxShadow: selected ? "0 0 12px rgba(234, 179, 8, 0.3)" : "none",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <div
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "6px",
            background: "#eab308",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#000",
          }}
        >
          <Zap size={15} />
        </div>
        <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary, #fff)" }}>
          ⚡ Trigger
        </span>
      </div>
      <div style={{ fontSize: "11px", color: "var(--text-secondary, #a1a1aa)", wordBreak: "break-word" }}>
        Keyword: <strong style={{ color: "#eab308" }}>{String(keyword)}</strong>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="next"
        style={{ background: "#eab308", width: "10px", height: "10px" }}
      />
    </div>
  );
});

TriggerNode.displayName = "TriggerNode";
