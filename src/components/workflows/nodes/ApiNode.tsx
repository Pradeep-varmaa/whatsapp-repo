import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Globe } from "lucide-react";

export const ApiNode = memo(({ data, selected }: NodeProps) => {
  const method = (data.method as string) || "GET";
  const url = (data.url as string) || "https://api.example.com";
  const save = data.save as string | undefined;

  let host = "endpoint";
  try {
    host = new URL(url).hostname;
  } catch {
    host = url.slice(0, 25);
  }

  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: "10px",
        background: "rgba(16, 185, 129, 0.12)",
        border: selected ? "2px solid #10b981" : "1px solid rgba(16, 185, 129, 0.4)",
        minWidth: "240px",
        maxWidth: "300px",
        boxShadow: selected ? "0 0 12px rgba(16, 185, 129, 0.3)" : "none",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#10b981", width: "10px", height: "10px" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <div
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "6px",
            background: "#10b981",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
          }}
        >
          <Globe size={14} />
        </div>
        <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary, #fff)" }}>
          🌐 Server API Call
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: "4px",
            background: "#059669",
            color: "#fff",
          }}
        >
          {method}
        </span>
        <span
          style={{
            fontSize: "11px",
            color: "var(--text-secondary, #a1a1aa)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {host}
        </span>
      </div>

      {save && (
        <div style={{ fontSize: "10px", color: "#6ee7b7", marginBottom: "4px" }}>
          save JSON to <code>{`{{${save}}}`}</code>
        </div>
      )}

      {(Boolean((data.mappings as any[])?.length) || Boolean(data.authorization)) ? (
        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }}>
          {Boolean(data.authorization) ? (
            <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "3px", background: "rgba(245, 158, 11, 0.2)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.4)" }}>
              🔑 Auth
            </span>
          ) : null}
          {Boolean((data.mappings as any[])?.length) ? (
            <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "3px", background: "rgba(168, 85, 247, 0.2)", color: "#c084fc", border: "1px solid rgba(168, 85, 247, 0.4)" }}>
              ⚡ {(data.mappings as any[]).length} Mapped
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Discrete Handles: Success (green) and Error (red) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "6px",
          borderTop: "1px solid rgba(16, 185, 129, 0.2)",
          fontSize: "10px",
          fontWeight: 600,
        }}
      >
        <div style={{ position: "relative", color: "#10b981" }}>
          <span>✓ Success</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="success"
            style={{
              left: "24px",
              background: "#10b981",
              width: "9px",
              height: "9px",
            }}
          />
        </div>
        <div style={{ position: "relative", color: "#ef4444" }}>
          <span>✕ Error</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="error"
            style={{
              left: "16px",
              background: "#ef4444",
              width: "9px",
              height: "9px",
            }}
          />
        </div>
      </div>
    </div>
  );
});

ApiNode.displayName = "ApiNode";
