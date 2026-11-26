import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";

export const TriggerNode = memo(({ data, selected }: NodeProps) => {
  const keyword = data.keyword ? String(data.keyword) : "Any message";
  const title = (data.title as string) || (data.keyword ? `Keyword: ${data.keyword}` : "Incoming Message");
  const subtitle = `Trigger · ${data.keyword ? `"${data.keyword}"` : "Any message"}`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 14px",
        borderRadius: "14px",
        background: "#ffffff",
        border: selected ? "2px solid #2563eb" : "1px solid #e2e8f0",
        minWidth: "220px",
        maxWidth: "280px",
        boxShadow: selected
          ? "0 0 0 3px rgba(37, 99, 235, 0.15), 0 4px 12px rgba(0, 0, 0, 0.06)"
          : "0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        position: "relative",
      }}
    >
      <div
        style={{
          width: "38px",
          height: "38px",
          minWidth: "38px",
          borderRadius: "10px",
          background: "#f59e0b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffffff",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
        }}
      >
        <Zap size={18} strokeWidth={2.4} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: "13.5px",
            color: "#0f172a",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={title}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: "11.5px",
            fontWeight: 500,
            color: "#64748b",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {subtitle}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="next"
        style={{
          background: "#64748b",
          border: "2px solid #ffffff",
          width: "9px",
          height: "9px",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
        }}
      />
    </div>
  );
});

TriggerNode.displayName = "TriggerNode";
