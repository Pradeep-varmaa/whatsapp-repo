import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Bot } from "lucide-react";

export const MessageNode = memo(({ data, selected }: NodeProps) => {
  const text = (data.text as string) || "Enter message text...";
  const title = (data.title as string) || (data.text ? `Msg: ${String(data.text).slice(0, 22)}` : "Message");
  const subtitle = "Automation · Text message";

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
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "#64748b",
          border: "2px solid #ffffff",
          width: "9px",
          height: "9px",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
        }}
      />

      <div
        style={{
          width: "38px",
          height: "38px",
          minWidth: "38px",
          borderRadius: "10px",
          background: "#7c3aed",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffffff",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
        }}
      >
        <Bot size={19} strokeWidth={2.2} />
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
          title={text}
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

MessageNode.displayName = "MessageNode";
