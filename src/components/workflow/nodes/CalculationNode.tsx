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
    if (operation === "formula") {
      return formula || "Custom formula";
    }
    if (operation === "date_diff_days") {
      return `${operandB || "Date 2"} - ${operandA || "Date 1"} (days)`;
    }
    if (operation === "date_add_days") {
      return `${operandA || "Date"} + ${operandB || "N"} days`;
    }
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

  const title = label || getOpBadge();
  const subtitle = `Calculation · ➔ {{${saveTo}}}`;

  return (
    <div
      style={{
        borderRadius: "14px",
        background: "#ffffff",
        border: selected ? "2px solid #16a34a" : "1px solid #e2e8f0",
        minWidth: "230px",
        maxWidth: "290px",
        boxShadow: selected
          ? "0 0 0 3px rgba(22, 163, 74, 0.15), 0 4px 12px rgba(0, 0, 0, 0.06)"
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
            background: "#16a34a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
          }}
        >
          <Calculator size={18} strokeWidth={2.4} />
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
              fontWeight: 600,
              color: "#16a34a",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: "8px",
          padding: "6px 8px",
          borderRadius: "6px",
          background: "#f0fdf4",
          border: "1px dashed #bbf7d0",
          fontSize: "11px",
          fontFamily: "ui-monospace, monospace",
          color: "#166534",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={getExpressionPreview()}
      >
        {getExpressionPreview()}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="next"
        style={{
          right: "-5px",
          top: "50%",
          transform: "translateY(-50%)",
          background: "#16a34a",
          border: "2px solid #ffffff",
          width: "10px",
          height: "10px",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
        }}
      />
    </div>
  );
});

CalculationNode.displayName = "CalculationNode";
