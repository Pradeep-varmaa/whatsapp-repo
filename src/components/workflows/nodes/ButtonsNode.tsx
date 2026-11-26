import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Radio } from "lucide-react";

export const ButtonsNode = memo(({ data, selected }: NodeProps) => {
  const text = (data.text as string) || "Choose an option:";
  const opts = (data.opts as Array<{ id: string; title: string }>) || [];

  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: "10px",
        background: "rgba(168, 85, 247, 0.12)",
        border: selected ? "2px solid #a855f7" : "1px solid rgba(168, 85, 247, 0.4)",
        minWidth: "240px",
        maxWidth: "300px",
        boxShadow: selected ? "0 0 12px rgba(168, 85, 247, 0.3)" : "none",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#a855f7", width: "10px", height: "10px" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <div
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "6px",
            background: "#a855f7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
          }}
        >
          <Radio size={14} />
        </div>
        <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary, #fff)" }}>
          🔘 Quick Reply Buttons
        </span>
      </div>
      <div
        style={{
          fontSize: "11px",
          color: "var(--text-secondary, #a1a1aa)",
          marginBottom: "10px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: "85px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          background: "rgba(0, 0, 0, 0.2)",
          padding: "6px 8px",
          borderRadius: "6px",
          border: "1px dashed rgba(168, 85, 247, 0.3)",
        }}
      >
        {text}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {opts.map((opt, idx) => {
          const isProceed = /proceed|confirm|yes|agree/i.test(opt.title) || /proceed|confirm/i.test(opt.id);
          const isCancel = /cancel|reject|no|abort/i.test(opt.title) || /cancel|reject/i.test(opt.id);
          const bg = isProceed ? "rgba(16, 185, 129, 0.25)" : isCancel ? "rgba(239, 68, 68, 0.25)" : "rgba(168, 85, 247, 0.2)";
          const color = isProceed ? "#6ee7b7" : isCancel ? "#fca5a5" : "#e9d5ff";
          const dotColor = isProceed ? "#10b981" : isCancel ? "#ef4444" : "#a855f7";

          return (
            <div
              key={opt.id || idx}
              style={{
                position: "relative",
                padding: "5px 10px",
                background: bg,
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 500,
                color,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{isProceed ? "✓ " : isCancel ? "✕ " : ""}{opt.title || `Button ${idx + 1}`}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={opt.id}
                style={{
                  right: "-12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: dotColor,
                  width: "10px",
                  height: "10px",
                }}
              />
            </div>
          );
        })}
        {opts.length === 0 && (
          <div style={{ fontSize: "10px", color: "#a855f7", fontStyle: "italic" }}>
            Add up to 3 buttons in right panel
          </div>
        )}
      </div>
    </div>
  );
});

ButtonsNode.displayName = "ButtonsNode";
