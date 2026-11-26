"use client";

import React, { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from "@xyflow/react";
import { Plus } from "lucide-react";

export interface StepAddEdgeData extends Record<string, unknown> {
  isOpen?: boolean;
  branchLabel?: string;
  isAltBranch?: boolean;
  onOpenAddStep?: (edgeId: string, anchorPos: { x: number; y: number }, source: string, target: string) => void;
}

export const StepAddEdge = memo(function StepAddEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const edgeData = (data as StepAddEdgeData) || {};
  const isOpen = Boolean(edgeData.isOpen);
  const branchLabel = edgeData.branchLabel;

  return (
    <>
      <defs>
        <marker
          id={`arrow-${id}`}
          markerWidth="12"
          markerHeight="12"
          refX="7"
          refY="6"
          orient="auto"
        >
          <path d="M2,2 L10,6 L2,10 L4,6 Z" fill="#94a3b8" />
        </marker>
      </defs>

      <BaseEdge
        path={edgePath}
        markerEnd={`url(#arrow-${id})`}
        style={{
          stroke: "#94a3b8",
          strokeWidth: 1.8,
          strokeDasharray: edgeData.isAltBranch ? "5 5" : undefined,
          ...style,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px",
          }}
          className="nodrag nopan"
        >
          {branchLabel && (
            <div
              style={{
                background: "#ffffff",
                padding: "2px 8px",
                borderRadius: "4px",
                border: "1px solid #e2e8f0",
                fontSize: "11px",
                fontWeight: 600,
                color: "#475467",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                whiteSpace: "nowrap",
                userSelect: "none",
              }}
            >
              {branchLabel}
            </div>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              edgeData.onOpenAddStep?.(id, { x: labelX, y: labelY }, source, target);
            }}
            title="Add step on this connection"
            aria-label="Add step"
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: isOpen ? "#2563eb" : "#ffffff",
              border: isOpen ? "2px solid #2563eb" : "1.5px solid #cbd5e1",
              color: isOpen ? "#ffffff" : "#64748b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: isOpen
                ? "0 4px 14px rgba(37, 99, 235, 0.35)"
                : "0 2px 8px rgba(15, 23, 42, 0.08)",
              transition: "all 0.15s ease",
              outline: "none",
            }}
            onMouseEnter={(e) => {
              if (!isOpen) {
                e.currentTarget.style.background = "#f8fafc";
                e.currentTarget.style.borderColor = "#2563eb";
                e.currentTarget.style.color = "#2563eb";
                e.currentTarget.style.transform = "scale(1.08)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isOpen) {
                e.currentTarget.style.background = "#ffffff";
                e.currentTarget.style.borderColor = "#cbd5e1";
                e.currentTarget.style.color = "#64748b";
                e.currentTarget.style.transform = "scale(1)";
              }
            }}
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
