import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { CONDITION_OPERATOR_LABELS, ConditionOperator } from "@/server/workflows/types";

export const ConditionNode = memo(({ data, selected }: NodeProps) => {
  const variable = (data.variable as string) || "response";
  const operator = ((data.operator as ConditionOperator) || "equals") as ConditionOperator;
  const value = (data.value as string) || "";
  const label = (data.label as string) || "";

  const opLabel = CONDITION_OPERATOR_LABELS[operator] || operator;

  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: "10px",
        background: "rgba(234, 179, 8, 0.12)",
        border: selected ? "2px solid #eab308" : "1px solid rgba(234, 179, 8, 0.4)",
        minWidth: "240px",
        maxWidth: "300px",
        boxShadow: selected ? "0 0 12px rgba(234, 179, 8, 0.3)" : "none",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#eab308", width: "10px", height: "10px" }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
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
          <GitBranch size={14} />
        </div>
        <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary, #fff)" }}>
          {label || "🔀 Condition (If / Else)"}
        </span>
      </div>

      <div
        style={{
          background: "rgba(0, 0, 0, 0.25)",
          padding: "6px 8px",
          borderRadius: "6px",
          marginBottom: "10px",
          fontSize: "11px",
          color: "var(--text-secondary, #e4e4e7)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
          <span style={{ color: "#fbbf24", fontWeight: 600 }}>if</span>
          <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: "3px" }}>
            {`{{${variable}}}`}
          </code>
          <span style={{ color: "#a1a1aa", fontSize: "10px" }}>{opLabel}</span>
          {operator !== "is_empty" && operator !== "is_not_empty" && operator !== "exists" && (
            <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: "3px" }}>
              {value || `""`}
            </code>
          )}
        </div>
      </div>

      {/* Discrete Handles: True (green) and False (rose/red) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "6px",
          borderTop: "1px solid rgba(234, 179, 8, 0.25)",
          fontSize: "10px",
          fontWeight: 600,
        }}
      >
        <div style={{ position: "relative", color: "#10b981", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <span>✓ True (If)</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{
              left: "18px",
              background: "#10b981",
              width: "9px",
              height: "9px",
            }}
          />
        </div>
        <div style={{ position: "relative", color: "#f43f5e", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span>✕ False (Else)</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{
              right: "18px",
              left: "auto",
              background: "#f43f5e",
              width: "9px",
              height: "9px",
            }}
          />
        </div>
      </div>
    </div>
  );
});

ConditionNode.displayName = "ConditionNode";
