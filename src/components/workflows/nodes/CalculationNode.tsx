import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Calculator } from "lucide-react";

export const CalculationNode = memo(({ data, selected }: NodeProps) => {
  const operation = (data?.operation as string) || "add";
  const operandA = (data?.operand_a as string) || "";
  const operandB = (data?.operand_b as string) || "";
  const formula = (data?.formula as string) || "";
  const saveTo = (data?.save_to as string) || "calc_result";
  const label = (data?.label as string) || "";

  const getOpBadge = () => {
    switch (operation) {
      case "date_diff_days":
        return "Days Difference";
      case "date_diff_hours":
        return "Hours Difference";
      case "date_diff_minutes":
        return "Minutes Difference";
      case "date_add_days":
        return "Add Days";
      case "add":
        return "Add (+)";
      case "subtract":
        return "Subtract (-)";
      case "multiply":
        return "Multiply (×)";
      case "divide":
        return "Divide (÷)";
      case "percentage":
        return "Percentage (%)";
      case "formula":
        return "Formula";
      case "round":
        return "Round";
      default:
        return operation;
    }
  };

  const getExpressionPreview = () => {
    if (operation === "formula") return formula || "Custom formula";
    if (operation === "date_diff_days") return `${operandB || "Date 2"} - ${operandA || "Date 1"} (days)`;
    if (operation === "date_add_days") return `${operandA || "Date"} + ${operandB || "N"} days`;
    const symbols: Record<string, string> = {
      add: "+",
      subtract: "-",
      multiply: "×",
      divide: "÷",
      percentage: "% of",
    };
    const sym = symbols[operation] || operation;
    return `${operandA || "A"} ${sym} ${operandB || "B"}`;
  };

  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: "10px",
        background: "rgba(22, 163, 74, 0.12)",
        border: selected ? "2px solid #16a34a" : "1px solid rgba(22, 163, 74, 0.4)",
        minWidth: "240px",
        maxWidth: "300px",
        boxShadow: selected ? "0 0 12px rgba(22, 163, 74, 0.3)" : "none",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#16a34a", width: "10px", height: "10px" }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <div
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "6px",
            background: "#16a34a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
          }}
        >
          <Calculator size={14} />
        </div>
        <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary, #fff)" }}>
          {label || `🧮 ${getOpBadge()}`}
        </span>
      </div>

      <div
        style={{
          fontSize: "11px",
          color: "#86efac",
          fontFamily: "monospace",
          marginBottom: "8px",
          padding: "4px 8px",
          background: "rgba(0, 0, 0, 0.2)",
          borderRadius: "4px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={getExpressionPreview()}
      >
        {getExpressionPreview()}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "11px",
          fontWeight: 600,
          color: "#4ade80",
        }}
      >
        <span>➔ {`{{${saveTo}}}`}</span>
        <Handle
          type="source"
          position={Position.Right}
          id="next"
          style={{
            right: "-12px",
            top: "50%",
            transform: "translateY(-50%)",
            background: "#16a34a",
            width: "9px",
            height: "9px",
          }}
        />
      </div>
    </div>
  );
});

CalculationNode.displayName = "CalculationNode";
