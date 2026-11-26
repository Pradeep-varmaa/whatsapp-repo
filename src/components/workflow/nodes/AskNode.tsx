import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { User, Calendar } from "lucide-react";

export const AskNode = memo(({ data, selected }: NodeProps) => {
  const text = (data.text as string) || "What is your answer?";
  const varName = (data.var as string) || "input";
  const kind = (data.kind as string) || "text";
  const isDate = kind === "date";

  const title = (data.title as string) || (data.text ? String(data.text).slice(0, 22) : (isDate ? "Select Date" : "Collect response"));
  const subtitle = isDate
    ? `Date Picker · date → {{${varName}}}`
    : `Assignment · ${kind} → {{${varName}}}`;

  const primaryColor = isDate ? "#0f766e" : "#2563eb";
  const cardBorder = selected
    ? `2px solid ${primaryColor}`
    : isDate
    ? "1px solid #99f6e4"
    : "1px solid #e2e8f0";
  const cardBg = isDate ? "#f0fdfa" : "#ffffff";
  const iconBg = isDate ? "#0f766e" : "#2563eb";
  const shadow = selected
    ? `0 0 0 3px ${isDate ? "rgba(15, 118, 110, 0.2)" : "rgba(37, 99, 235, 0.15)"}, 0 4px 12px rgba(0, 0, 0, 0.06)`
    : isDate
    ? "0 1px 3px rgba(15, 118, 110, 0.1), 0 1px 2px rgba(0, 0, 0, 0.04)"
    : "0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 14px",
        borderRadius: "14px",
        background: cardBg,
        border: cardBorder,
        minWidth: "220px",
        maxWidth: "280px",
        boxShadow: shadow,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        position: "relative",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: isDate ? "#0f766e" : "#64748b",
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
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffffff",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
        }}
      >
        {isDate ? <Calendar size={19} strokeWidth={2.2} /> : <User size={19} strokeWidth={2.2} />}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: "13.5px",
            color: isDate ? "#134e4a" : "#0f172a",
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
            color: isDate ? "#0d9488" : "#64748b",
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
          background: isDate ? "#0f766e" : "#64748b",
          border: "2px solid #ffffff",
          width: "9px",
          height: "9px",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
        }}
      />
    </div>
  );
});

AskNode.displayName = "AskNode";
