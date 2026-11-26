import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { List, Sparkles } from "lucide-react";

export const ListNode = memo(({ data, selected }: NodeProps) => {
  const text = (data.text as string) || "Select from menu:";
  const buttonText = (data.buttonText as string) || "Open Menu";
  const isDynamic = Boolean(data.is_dynamic || data.dynamicRows);
  const opts = (data.opts as Array<{ id: string; title: string; description?: string }>) || [];

  const title = (data.title as string) || (data.text ? String(data.text).slice(0, 22) : "Menu List");
  const subtitle = `Menu · ${isDynamic ? "Dynamic rows" : `${opts.length} option${opts.length !== 1 ? "s" : ""}`}`;

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
            background: "#0284c7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
          }}
        >
          <List size={18} strokeWidth={2.4} />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
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
            {isDynamic && (
              <span
                style={{
                  fontSize: "9.5px",
                  background: "#e0f2fe",
                  color: "#0369a1",
                  border: "1px solid #bae6fd",
                  padding: "1px 5px",
                  borderRadius: "4px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2px",
                }}
              >
                <Sparkles size={9} /> Dynamic
              </span>
            )}
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

      {isDynamic ? (
        <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #f1f5f9" }}>
          <div
            style={{
              position: "relative",
              padding: "5px 8px",
              background: "#f0f9ff",
              borderRadius: "6px",
              fontSize: "11px",
              color: "#0369a1",
              border: "1px dashed #7dd3fc",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 600 }}>Selected Option</span>
            <Handle
              type="source"
              position={Position.Right}
              id="next"
              style={{
                right: "-12px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "#64748b",
                border: "2px solid #ffffff",
                width: "9px",
                height: "9px",
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
              }}
            />
          </div>
        </div>
      ) : (
        opts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #f1f5f9" }}>
            {opts.map((opt, idx) => (
              <div
                key={opt.id || idx}
                style={{
                  position: "relative",
                  padding: "4px 8px",
                  background: "#f8fafc",
                  borderRadius: "6px",
                  border: "1px solid #e2e8f0",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#334155",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "180px" }}>
                  {opt.title || `Option ${idx + 1}`}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={opt.id}
                  style={{
                    right: "-12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "#64748b",
                    border: "2px solid #ffffff",
                    width: "9px",
                    height: "9px",
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
                  }}
                />
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
});

ListNode.displayName = "ListNode";
