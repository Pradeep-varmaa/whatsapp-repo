import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Radio } from "lucide-react";

export const ButtonsNode = memo(({ data, selected }: NodeProps) => {
  const text = (data.text as string) || "Choose an option:";
  const opts = (data.opts as Array<{ id: string; title: string }>) || [];
  const title = (data.title as string) || (data.text ? String(data.text).slice(0, 22) : "Quick Reply Buttons");
  const subtitle = `Buttons · ${opts.length} option${opts.length !== 1 ? "s" : ""}`;

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
            background: "#8b5cf6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
          }}
        >
          <Radio size={18} strokeWidth={2.4} />
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
      </div>

      {text && (
        <div
          style={{
            fontSize: "11px",
            color: "#475467",
            marginTop: "8px",
            lineHeight: "1.45",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: "85px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            background: "#f8fafc",
            padding: "6px 8px",
            borderRadius: "6px",
            border: "1px dashed #cbd5e1",
          }}
          title={text}
        >
          {text}
        </div>
      )}

      {opts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #f1f5f9" }}>
          {opts.map((opt, idx) => {
            const isProceed = /proceed|confirm|yes|agree/i.test(opt.title) || /proceed|confirm/i.test(opt.id);
            const isCancel = /cancel|reject|no|abort/i.test(opt.title) || /cancel|reject/i.test(opt.id);
            const badgeBg = isProceed ? "#ecfdf5" : isCancel ? "#fef2f2" : "#f8fafc";
            const badgeColor = isProceed ? "#065f46" : isCancel ? "#991b1b" : "#334155";
            const badgeBorder = isProceed ? "#a7f3d0" : isCancel ? "#fecaca" : "#e2e8f0";
            const dotColor = isProceed ? "#10b981" : isCancel ? "#ef4444" : "#8b5cf6";

            return (
              <div
                key={opt.id || idx}
                style={{
                  position: "relative",
                  padding: "5px 8px",
                  background: badgeBg,
                  borderRadius: "6px",
                  border: `1px solid ${badgeBorder}`,
                  fontSize: "11px",
                  fontWeight: 600,
                  color: badgeColor,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "180px" }}>
                  {isProceed ? "✓ " : isCancel ? "✕ " : ""}{opt.title || `Option ${idx + 1}`}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={opt.id}
                  style={{
                    right: "-12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: dotColor,
                    border: "2px solid #ffffff",
                    width: "10px",
                    height: "10px",
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

ButtonsNode.displayName = "ButtonsNode";
