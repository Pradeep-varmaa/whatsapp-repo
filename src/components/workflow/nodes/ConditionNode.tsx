import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { GitFork } from "lucide-react";
import { CONDITION_OPERATOR_LABELS, ConditionOperator } from "@/server/workflows/types";

export const ConditionNode = memo(({ data, selected }: NodeProps) => {
  const variable = (data.variable as string) || "response";
  const operator = ((data.operator as ConditionOperator) || "equals") as ConditionOperator;
  const value = (data.value as string) || "";
  const label = (data.label as string) || "";

  const opLabel = CONDITION_OPERATOR_LABELS[operator] || operator;
  const title = label || (variable ? `${variable.replace(/_/g, " ")}?` : "Decision");
  const subtitle = `Decision · ${opLabel}`;

  const trueLabel = (data.true_label as string) || "True";
  const falseLabel = (data.false_label as string) || "False";

  return (
    <div
      style={{
        borderRadius: "14px",
        background: "#ffffff",
        border: selected ? "2px solid #2563eb" : "1px solid #e2e8f0",
        minWidth: "230px",
        maxWidth: "290px",
        boxShadow: selected
          ? "0 0 0 3px rgba(37, 99, 235, 0.15), 0 4px 12px rgba(0, 0, 0, 0.06)"
          : "0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        position: "relative",
        padding: "10px 14px",
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

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div
          style={{
            width: "38px",
            height: "38px",
            minWidth: "38px",
            borderRadius: "10px",
            background: "#d97706",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
          }}
        >
          <GitFork size={18} strokeWidth={2.4} />
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
      </div>

      {/* Discrete Handles Footer for True / False */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "10px",
          paddingTop: "6px",
          borderTop: "1px solid #f1f5f9",
          fontSize: "10.5px",
          fontWeight: 600,
        }}
      >
        <div style={{ position: "relative", color: "#16a34a", paddingLeft: "2px" }}>
          <span>{trueLabel}</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{
              left: "14px",
              background: "#64748b",
              border: "2px solid #ffffff",
              width: "9px",
              height: "9px",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
            }}
          />
        </div>

        <div style={{ position: "relative", color: "#dc2626", paddingRight: "2px" }}>
          <span>{falseLabel}</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{
              right: "14px",
              left: "auto",
              background: "#64748b",
              border: "2px solid #ffffff",
              width: "9px",
              height: "9px",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
            }}
          />
        </div>
      </div>
    </div>
  );
});

ConditionNode.displayName = "ConditionNode";
