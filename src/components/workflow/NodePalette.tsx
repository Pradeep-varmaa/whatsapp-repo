"use client";

import React, { useState } from "react";
import {
  MessageSquare,
  Radio,
  List,
  HelpCircle,
  Globe,
  Flag,
  Calendar,
  Clock,
  Sparkles,
  Bot,
  Copy,
  Plus,
  Check,
  CheckSquare,
  Calculator,
  GitBranch,
} from "lucide-react";
import { NodeType } from "@/server/workflows/types";
import { CalendarPicker } from "./CalendarPicker";
import { TimePicker } from "./TimePicker";
import { message } from "antd";

interface NodePaletteProps {
  onAddNode: (type: NodeType, customData?: Record<string, any>) => void;
}

interface PaletteItem {
  id: string;
  type: NodeType;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  customData?: Record<string, any>;
}

const PALETTE_ITEMS: PaletteItem[] = [
  {
    id: "message",
    type: "message",
    label: "Message",
    desc: "Send text with variable tokens",
    icon: <MessageSquare size={16} />,
    color: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.12)",
  },
  {
    id: "buttons",
    type: "buttons",
    label: "Quick Buttons",
    desc: "Up to 3 reply buttons",
    icon: <Radio size={16} />,
    color: "#a855f7",
    bg: "rgba(168, 85, 247, 0.12)",
  },
  {
    id: "review_and_confirm",
    type: "buttons",
    label: "Review & Confirm",
    desc: "Plain text details + Proceed / Cancel",
    icon: <CheckSquare size={16} />,
    color: "#0891b2",
    bg: "rgba(8, 145, 178, 0.12)",
    customData: {
      text: "Please review your submitted request details:\n\n• Name: {{customer_name}}\n• Details: {{customer_input}}\n• Date/Time: {{selected_date}} at {{selected_time}}\n\nSelect an option below to proceed or cancel:",
      opts: [
        { id: "btn_proceed", title: "Proceed" },
        { id: "btn_cancel", title: "Cancel" },
      ],
    },
  },
  {
    id: "list",
    type: "list",
    label: "Menu List",
    desc: "Up to 10 interactive rows",
    icon: <List size={16} />,
    color: "#0ea5e9",
    bg: "rgba(14, 165, 233, 0.12)",
  },
  {
    id: "date_picker",
    type: "ask",
    label: "Date Picker",
    desc: "Calendar date selection",
    icon: <Calendar size={16} />,
    color: "#0f766e",
    bg: "rgba(15, 118, 110, 0.12)",
    customData: {
      text: "Please select your appointment date:",
      var: "selected_date",
      kind: "date",
    },
  },
  {
    id: "time_picker",
    type: "ask",
    label: "Time Picker",
    desc: "Time slots selection",
    icon: <Clock size={16} />,
    color: "#0284c7",
    bg: "rgba(2, 132, 199, 0.12)",
    customData: {
      text: "Please select your preferred time slot:",
      var: "selected_time",
      kind: "time",
    },
  },
  {
    id: "ask",
    type: "ask",
    label: "Ask Question",
    desc: "Capture reply into variable",
    icon: <HelpCircle size={16} />,
    color: "#f97316",
    bg: "rgba(249, 115, 22, 0.12)",
  },
  {
    id: "api",
    type: "api",
    label: "Server API",
    desc: "HTTP call with success/error",
    icon: <Globe size={16} />,
    color: "#10b981",
    bg: "rgba(168, 85, 247, 0.12)",
  },
  {
    id: "condition",
    type: "condition",
    label: "Condition (If / Else)",
    desc: "Branch flow on variable logic",
    icon: <GitBranch size={16} />,
    color: "#eab308",
    bg: "rgba(234, 179, 8, 0.12)",
    customData: {
      variable: "response",
      operator: "equals",
      value: "",
    },
  },
  {
    id: "calculation",
    type: "calculation",
    label: "Calculation",
    desc: "Date differences & number math",
    icon: <Calculator size={16} />,
    color: "#16a34a",
    bg: "rgba(22, 163, 74, 0.12)",
    customData: {
      operation: "add",
      operand_a: "{{num1}}",
      operand_b: "{{num2}}",
      save_to: "calc_result",
      label: "Calculation",
    },
  },
  {
    id: "end",
    type: "end",
    label: "End Flow",
    desc: "Terminate execution cleanly",
    icon: <Flag size={16} />,
    color: "#9ca3af",
    bg: "rgba(156, 163, 175, 0.15)",
  },
];

export function NodePalette({ onAddNode }: NodePaletteProps) {
  const [sidebarTab, setSidebarTab] = useState<"steps" | "calendar" | "time">("steps");
  const [selectedDatePreview, setSelectedDatePreview] = useState<string>("");
  const [selectedTimePreview, setSelectedTimePreview] = useState<string>("");

  const onDragStart = (event: React.DragEvent, item: PaletteItem) => {
    event.dataTransfer.setData("application/reactflow/type", item.type);
    if (item.customData) {
      event.dataTransfer.setData("application/reactflow/customData", JSON.stringify(item.customData));
    }
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      style={{
        width: "280px",
        height: "100%",
        borderRight: "1px solid var(--border, #27272a)",
        background: "var(--bg-card, #18181b)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* Header with Title and Mode Switcher */}
      <div style={{ padding: "14px 12px 10px 12px", borderBottom: "1px solid var(--border, #27272a)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "4px" }}>
          <div
            style={{
              width: "22px",
              height: "22px",
              borderRadius: "5px",
              background: "#0f9d7a",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Bot size={14} />
          </div>
          <h3 style={{ fontSize: "13px", fontWeight: 700, margin: 0, color: "var(--text-primary, #fff)" }}>
            Agent Palette
          </h3>
        </div>
        <p style={{ fontSize: "10.5px", color: "var(--text-secondary, #71717a)", margin: "0 0 10px 0" }}>
          Drag tools onto canvas to build your agent's behavior.
        </p>

        {/* Sidebar View Tabs (Steps vs Date vs Time) */}
        <div
          style={{
            display: "flex",
            background: "rgba(255, 255, 255, 0.06)",
            borderRadius: "6px",
            padding: "2px",
            gap: "2px",
          }}
        >
          <button
            type="button"
            onClick={() => setSidebarTab("steps")}
            style={{
              flex: 1,
              padding: "5px 6px",
              borderRadius: "5px",
              border: "none",
              background: sidebarTab === "steps" ? "#0f9d7a" : "transparent",
              color: sidebarTab === "steps" ? "#ffffff" : "var(--text-secondary, #a1a1aa)",
              fontSize: "10.5px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Steps
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab("calendar")}
            style={{
              flex: 1,
              padding: "5px 6px",
              borderRadius: "5px",
              border: "none",
              background: sidebarTab === "calendar" ? "#0f766e" : "transparent",
              color: sidebarTab === "calendar" ? "#ffffff" : "var(--text-secondary, #a1a1aa)",
              fontSize: "10.5px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              transition: "all 0.15s ease",
            }}
          >
            <Calendar size={12} /> Date
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab("time")}
            style={{
              flex: 1,
              padding: "5px 6px",
              borderRadius: "5px",
              border: "none",
              background: sidebarTab === "time" ? "#0284c7" : "transparent",
              color: sidebarTab === "time" ? "#ffffff" : "var(--text-secondary, #a1a1aa)",
              fontSize: "10.5px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              transition: "all 0.15s ease",
            }}
          >
            <Clock size={12} /> Time
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
        {sidebarTab === "steps" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {PALETTE_ITEMS.map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => onDragStart(e, item)}
                onClick={() => onAddNode(item.type, item.customData)}
                style={{
                  padding: "9px 12px",
                  borderRadius: "8px",
                  background: item.bg,
                  border: `1px solid ${item.color}33`,
                  cursor: "grab",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  transition: "transform 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.borderColor = item.color;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.borderColor = `${item.color}33`;
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    background: item.color,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary, #fff)" }}>
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "var(--text-secondary, #a1a1aa)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sidebar Interactive Calendar View */}
        {sidebarTab === "calendar" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "11px", color: "var(--text-secondary, #a1a1aa)" }}>
              Interactive calendar tool. Pick dates or add as a step to your agent.
            </div>

            <CalendarPicker
              inline
              onSelect={(isoDate, formattedDate) => {
                setSelectedDatePreview(`${formattedDate} (${isoDate})`);
                message.success(`Selected date: ${formattedDate}`);
              }}
            />

            {selectedDatePreview && (
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: "6px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div style={{ fontSize: "10px", color: "#166534", fontWeight: 600 }}>Active Date Selection:</div>
                <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#15803d" }}>
                  {selectedDatePreview}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                onAddNode("ask", {
                  text: "Please select your appointment date:",
                  var: "selected_date",
                  kind: "date",
                });
                message.success("Added Date Picker step to Agent canvas");
              }}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                background: "#0f766e",
                color: "#ffffff",
                border: "none",
                fontSize: "11.5px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <Plus size={14} /> Add Date Picker Step
            </button>
          </div>
        )}

        {/* Sidebar Interactive Time View */}
        {sidebarTab === "time" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "11px", color: "var(--text-secondary, #a1a1aa)" }}>
              Interactive time slot tool. Select slots or add as a step to your agent.
            </div>

            <TimePicker
              inline
              onSelect={(timeStr) => {
                setSelectedTimePreview(timeStr);
                message.success(`Selected time: ${timeStr}`);
              }}
            />

            {selectedTimePreview && (
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: "6px",
                  background: "#f0f9ff",
                  border: "1px solid #bae6fd",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div style={{ fontSize: "10px", color: "#0369a1", fontWeight: 600 }}>Active Time Selection:</div>
                <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#0284c7" }}>
                  {selectedTimePreview}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                onAddNode("ask", {
                  text: "Please select your preferred time slot:",
                  var: "selected_time",
                  kind: "time",
                });
                message.success("Added Time Picker step to Agent canvas");
              }}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                background: "#0284c7",
                color: "#ffffff",
                border: "none",
                fontSize: "11.5px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <Plus size={14} /> Add Time Picker Step
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
