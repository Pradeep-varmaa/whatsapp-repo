import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { List, Sparkles } from "lucide-react";

export const ListNode = memo(({ data, selected }: NodeProps) => {
  const text = (data.text as string) || "Select from menu:";
  const buttonText = (data.buttonText as string) || "Open Menu";
  const isDynamic = Boolean(data.is_dynamic || data.dynamicRows);
  const arrayPath = (data.array_path as string) || "{{api_result.data}}";
  const titleField = (data.title_field as string) || "title";
  const opts = (data.opts as Array<{ id: string; title: string; description?: string }>) || [];

  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: "10px",
        background: "rgba(14, 165, 233, 0.12)",
        border: selected ? "2px solid #0ea5e9" : "1px solid rgba(14, 165, 233, 0.4)",
        minWidth: "240px",
        maxWidth: "300px",
        boxShadow: selected ? "0 0 12px rgba(14, 165, 233, 0.3)" : "none",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#0ea5e9", width: "10px", height: "10px" }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "6px",
              background: "#0ea5e9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <List size={14} />
          </div>
          <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary, #fff)" }}>
            📋 List Menu
          </span>
        </div>
        {isDynamic && (
          <span
            style={{
              fontSize: "10px",
              background: "#0284c7",
              color: "#fff",
              padding: "2px 6px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              gap: "3px",
              fontWeight: 600,
            }}
          >
            <Sparkles size={10} /> Dynamic
          </span>
        )}
      </div>

      <div style={{ fontSize: "11px", color: "var(--text-secondary, #a1a1aa)", marginBottom: "4px" }}>
        {text}
      </div>
      <div style={{ fontSize: "10px", color: "#38bdf8", fontWeight: 600, marginBottom: "8px" }}>
        Menu Button: [{buttonText}]
      </div>

      {isDynamic ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div
            style={{
              position: "relative",
              padding: "6px 8px",
              background: "rgba(14, 165, 233, 0.22)",
              borderRadius: "6px",
              fontSize: "11px",
              color: "#bae6fd",
              border: "1px dashed #38bdf8",
            }}
          >
            <div style={{ fontSize: "10px", color: "#7dd3fc", fontWeight: 600 }}>
              Array: <code>{arrayPath}</code>
            </div>
            <div style={{ fontSize: "10.5px", marginTop: "2px", color: "#e0f2fe" }}>
              Row Title: <code>{titleField}</code> (Max 10 rows)
            </div>
            <Handle
              type="source"
              position={Position.Right}
              id="next"
              style={{
                right: "-12px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "#0ea5e9",
                width: "10px",
                height: "10px",
              }}
            />
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {opts.map((opt, idx) => (
            <div
              key={opt.id || idx}
              style={{
                position: "relative",
                padding: "4px 8px",
                background: "rgba(14, 165, 233, 0.18)",
                borderRadius: "6px",
                fontSize: "11px",
                color: "#bae6fd",
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
                  background: "#0ea5e9",
                  width: "9px",
                  height: "9px",
                }}
              />
            </div>
          ))}
          {/* Also provide a next handle so users can connect the whole list to a next step */}
          <Handle
            type="source"
            position={Position.Right}
            id="next"
            style={{
              right: "-12px",
              bottom: "8px",
              background: "#0ea5e9",
              width: "8px",
              height: "8px",
            }}
          />
        </div>
      )}
    </div>
  );
});

ListNode.displayName = "ListNode";
