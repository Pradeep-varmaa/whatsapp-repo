import React, { memo } from "react";
import { NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import { TriggerNode } from "./TriggerNode";
import { MessageNode } from "./MessageNode";
import { ButtonsNode } from "./ButtonsNode";
import { ListNode } from "./ListNode";
import { AskNode } from "./AskNode";
import { ApiNode } from "./ApiNode";
import { ConditionNode } from "./ConditionNode";
import { CalculationNode } from "./CalculationNode";
import { EndNode } from "./EndNode";
import { GotoFlowNode } from "./GotoFlowNode";

function createWrappedNode(Component: React.ComponentType<NodeProps>) {
  const WrappedNode = memo((props: NodeProps) => {
    const hasError = Boolean(props.data?._hasError);
    const isTail = Boolean(props.data?._isTail);
    const onAddTailStep = props.data?._onAddTailStep as ((nodeId: string, event: React.MouseEvent) => void) | undefined;

    return (
      <div style={{ position: "relative", cursor: "grab" }}>
        <Component {...props} />

        {/* Validation Issue Badge */}
        {hasError && (
          <div
            title="This step has validation issues"
            style={{
              position: "absolute",
              top: "-8px",
              right: "-8px",
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              background: "#d92d20",
              color: "#ffffff",
              fontSize: "12px",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 6px rgba(217, 45, 32, 0.4)",
              zIndex: 20,
              border: "2px solid #ffffff",
              pointerEvents: "none",
            }}
          >
            !
          </div>
        )}

        {/* Tail + Button if branch is uncompleted */}
        {isTail && onAddTailStep && (
          <div
            style={{
              position: "absolute",
              bottom: "-48px",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              zIndex: 15,
            }}
            className="nodrag nopan"
          >
            {/* Connecting stub line */}
            <div
              style={{
                width: "2px",
                height: "14px",
                background: "#94a3b8",
              }}
            />
            {/* 44x44px touch target with clean circular button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddTailStep(props.id, e);
              }}
              title="Add next step"
              aria-label="Add next step"
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "#ffffff",
                border: "1.5px solid #cbd5e1",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(15, 23, 42, 0.08)",
                transition: "all 0.15s ease",
                outline: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f8fafc";
                e.currentTarget.style.borderColor = "#2563eb";
                e.currentTarget.style.color = "#2563eb";
                e.currentTarget.style.transform = "scale(1.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#ffffff";
                e.currentTarget.style.borderColor = "#cbd5e1";
                e.currentTarget.style.color = "#64748b";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <Plus size={18} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
    );
  });
  WrappedNode.displayName = `WrappedNode(${Component.displayName || Component.name || "Component"})`;
  return WrappedNode;
}

export const nodeTypes = {
  trigger: createWrappedNode(TriggerNode),
  message: createWrappedNode(MessageNode),
  buttons: createWrappedNode(ButtonsNode),
  list: createWrappedNode(ListNode),
  ask: createWrappedNode(AskNode),
  api: createWrappedNode(ApiNode),
  condition: createWrappedNode(ConditionNode),
  calculation: createWrappedNode(CalculationNode),
  end: createWrappedNode(EndNode),
  goto_flow: createWrappedNode(GotoFlowNode),
};
