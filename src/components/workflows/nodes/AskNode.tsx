import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { HelpCircle, Calendar } from "lucide-react";

export const AskNode = memo(({ data, selected }: NodeProps) => {
  const text = (data.text as string) || "What is your answer?";
  const varName = (data.var as string) || "input";
  const kind = (data.kind as string) || "text";
  const isDate = kind === "date";

  const primaryColor = isDate ? "#0f766e" : "#f97316";
  const cardBg = isDate ? "rgba(15, 118, 110, 0.15)" : "rgba(249, 115, 22, 0.12)";
  const cardBorder = selected
    ? `2px solid ${primaryColor}`
    : isDate
    ? "1px solid rgba(15, 118, 110, 0.45)"
    : "1px solid rgba(249, 115, 22, 0.4)";
  const shadow = selected
    ? `0 0 12px ${isDate ? "rgba(15, 118, 110, 0.4)" : "rgba(249, 115, 22, 0.3)"}`
    : "none";

  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: "10px",
        background: cardBg,
        border: cardBorder,
        minWidth: "220px",
        maxWidth: "280px",
        boxShadow: shadow,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: primaryColor, width: "10px", height: "10px" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <div
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "6px",
            background: primaryColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
          }}
        >
          {isDate ? <Calendar size={14} /> : <HelpCircle size={14} />}
        </div>
        <span style={{ fontWeight: 600, fontSize: "13px", color: isDate ? "#14b8a6" : "var(--text-primary, #fff)" }}>
          {isDate ? "📅 Date Picker" : "❓ Ask Question"}
        </span>
      </div>
      <div
        style={{
          fontSize: "11px",
          color: isDate ? "#ccfbf1" : "var(--text-secondary, #a1a1aa)",
          marginBottom: "6px",
        }}
      >
        {text}
      </div>
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <span
          style={{
            fontSize: "10px",
            padding: "2px 6px",
            borderRadius: "4px",
            background: primaryColor,
            color: "#fff",
            fontWeight: 600,
          }}
        >
          {kind}
        </span>
        <span style={{ fontSize: "11px", color: isDate ? "#99f6e4" : "#fdba74" }}>
          save to <code>{`{{${varName}}}`}</code>
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="next"
        style={{ background: primaryColor, width: "10px", height: "10px" }}
      />
    </div>
  );
});

AskNode.displayName = "AskNode";
