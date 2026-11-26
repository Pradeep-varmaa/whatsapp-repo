"use client";

import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, Radio, List, HelpCircle, Calendar, Clock, Globe, Flag, Search, X, GitFork, Calculator } from "lucide-react";
import { NodeType } from "@/server/workflows/types";
import { STEP_TYPE_PRESETS } from "./workflowUtils";

interface StepAddPopoverProps {
  anchorTitle: string;
  position: { x: number; y: number }; // Flow or screen coordinates
  onSelectStep: (type: NodeType, customData?: Record<string, any>) => void;
  onClose: () => void;
}

const STEP_ICONS: Record<string, React.ReactNode> = {
  message: <MessageSquare size={16} />,
  buttons: <Radio size={16} />,
  list: <List size={16} />,
  ask: <HelpCircle size={16} />,
  api: <Globe size={16} />,
  goto_flow: <GitFork size={16} />,
  calculation: <Calculator size={16} />,
  end: <Flag size={16} />,
};

export function StepAddPopover({
  anchorTitle,
  position,
  onSelectStep,
  onClose,
}: StepAddPopoverProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filteredPresets = STEP_TYPE_PRESETS.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q)
    );
  });

  // Clamp selection index when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Keyboard navigation: ArrowUp, ArrowDown, Enter, Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (filteredPresets.length > 0 ? (prev + 1) % filteredPresets.length : 0));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (filteredPresets.length > 0 ? (prev - 1 + filteredPresets.length) % filteredPresets.length : 0));
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (filteredPresets[selectedIndex]) {
          const item = filteredPresets[selectedIndex];
          onSelectStep(item.type, item.customData);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredPresets, selectedIndex, onSelectStep, onClose]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      style={{
        position: "absolute",
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: "translate(-50%, 14px)",
        width: "300px",
        background: "#ffffff",
        borderRadius: "12px",
        boxShadow: "0 10px 30px rgba(16, 24, 40, 0.15), 0 1px 3px rgba(16, 24, 40, 0.1)",
        border: "1px solid #eaecf0",
        padding: "12px",
        zIndex: 9999,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "8px",
          paddingBottom: "8px",
          borderBottom: "1px solid #f2f4f7",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontWeight: 700,
            color: "#344054",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "240px",
          }}
          title={anchorTitle}
        >
          Add step after &quot;{anchorTitle}&quot;
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "#98a2b3",
            padding: "2px",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Search Input */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <Search
          size={14}
          color="#98a2b3"
          style={{ position: "absolute", left: "10px", pointerEvents: "none" }}
        />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search steps..."
          style={{
            width: "100%",
            padding: "8px 10px 8px 30px",
            borderRadius: "8px",
            border: "1px solid #d0d5dd",
            fontSize: "12.5px",
            color: "#101828",
            outline: "none",
            boxSizing: "border-box",
            background: "#ffffff",
          }}
          onFocus={(e) => (e.target.style.borderColor = "#10b981")}
          onBlur={(e) => (e.target.style.borderColor = "#d0d5dd")}
        />
      </div>

      {/* Options List */}
      <div
        style={{
          maxHeight: "260px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        {filteredPresets.length === 0 ? (
          <div style={{ textAlign: "center", padding: "16px 8px", color: "#667085", fontSize: "12px" }}>
            No matching step types found
          </div>
        ) : (
          filteredPresets.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            const icon =
              item.name === "Date Picker" ? (
                <Calendar size={15} />
              ) : item.name === "Time Picker" ? (
                <Clock size={15} />
              ) : (
                STEP_ICONS[item.type] || <MessageSquare size={15} />
              );

            return (
              <div
                key={`${item.name}_${idx}`}
                onClick={() => onSelectStep(item.type, item.customData)}
                onMouseEnter={() => setSelectedIndex(idx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  background: isSelected ? item.bg : "transparent",
                  border: isSelected ? `1px solid ${item.color}44` : "1px solid transparent",
                  transition: "all 0.12s ease",
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    background: item.bg,
                    color: item.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: isSelected ? item.color : "#101828",
                      lineHeight: "1.2",
                    }}
                  >
                    {item.name}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#667085",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.subtitle}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
