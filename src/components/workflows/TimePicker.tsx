"use client";

import React, { useState } from "react";
import { Clock, Check, X, Sunrise, Sun, Sunset, Sparkles } from "lucide-react";

export interface TimePickerProps {
  value?: string;
  onSelect: (timeStr: string) => void;
  onClose?: () => void;
  title?: string;
  inline?: boolean;
}

const MORNING_SLOTS = [
  "09:00 AM - 10:00 AM",
  "10:00 AM - 11:00 AM",
  "11:00 AM - 12:00 PM",
];

const AFTERNOON_SLOTS = [
  "01:00 PM - 02:00 PM",
  "02:00 PM - 03:00 PM",
  "03:00 PM - 04:00 PM",
  "04:00 PM - 05:00 PM",
];

const EVENING_SLOTS = [
  "05:00 PM - 06:00 PM",
  "06:00 PM - 07:00 PM",
  "07:00 PM - 08:00 PM",
  "08:00 PM - 09:00 PM",
];

export function TimePicker({
  value,
  onSelect,
  onClose,
  title = "Select Time",
  inline = false,
}: TimePickerProps) {
  const [mode, setMode] = useState<"slots" | "custom">("slots");
  const [selectedSlot, setSelectedSlot] = useState<string>(value || "10:00 AM - 11:00 AM");

  // Custom time states
  const [hour, setHour] = useState<string>("10");
  const [minute, setMinute] = useState<string>("00");
  const [period, setPeriod] = useState<"AM" | "PM">("AM");

  const customTimeFormatted = `${hour}:${minute} ${period}`;

  const currentSelection = mode === "slots" ? selectedSlot : customTimeFormatted;

  const handleConfirm = () => {
    onSelect(currentSelection);
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "320px",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "10px",
        boxShadow: inline ? "none" : "0 4px 14px rgba(0, 0, 0, 0.1)",
        padding: "12px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        boxSizing: "border-box",
        userSelect: "none",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
          paddingBottom: "8px",
          borderBottom: "1px solid #f1f5f9",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Clock size={15} color="#0284c7" />
          <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#0f172a" }}>
            {title}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#64748b",
              cursor: "pointer",
              padding: "2px",
              display: "flex",
              alignItems: "center",
              borderRadius: "4px",
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Mode Switch Tabs (Slots vs Custom Time) */}
      <div
        style={{
          display: "flex",
          background: "#f1f5f9",
          borderRadius: "6px",
          padding: "2px",
          marginBottom: "10px",
        }}
      >
        <button
          type="button"
          onClick={() => setMode("slots")}
          style={{
            flex: 1,
            padding: "4px 8px",
            borderRadius: "4px",
            border: "none",
            background: mode === "slots" ? "#ffffff" : "transparent",
            color: mode === "slots" ? "#0369a1" : "#64748b",
            fontWeight: mode === "slots" ? 700 : 500,
            fontSize: "11px",
            cursor: "pointer",
            boxShadow: mode === "slots" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          Preset Slots
        </button>
        <button
          type="button"
          onClick={() => setMode("custom")}
          style={{
            flex: 1,
            padding: "4px 8px",
            borderRadius: "4px",
            border: "none",
            background: mode === "custom" ? "#ffffff" : "transparent",
            color: mode === "custom" ? "#0369a1" : "#64748b",
            fontWeight: mode === "custom" ? 700 : 500,
            fontSize: "11px",
            cursor: "pointer",
            boxShadow: mode === "custom" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          Custom Time
        </button>
      </div>

      {/* Preset Slots Mode */}
      {mode === "slots" ? (
        <div style={{ maxHeight: "210px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingRight: "2px" }}>
          {/* Morning Section */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 700, color: "#d97706", marginBottom: "4px" }}>
              <Sunrise size={12} /> Morning
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "4px" }}>
              {MORNING_SLOTS.map((slot) => {
                const isSel = selectedSlot === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    style={{
                      padding: "5px 8px",
                      borderRadius: "6px",
                      border: isSel ? "1.5px solid #0284c7" : "1px solid #e2e8f0",
                      background: isSel ? "#f0f9ff" : "#ffffff",
                      color: isSel ? "#0369a1" : "#334155",
                      fontSize: "11px",
                      fontWeight: isSel ? 700 : 500,
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "all 0.12s ease",
                    }}
                  >
                    <span>{slot}</span>
                    {isSel && <Check size={12} color="#0284c7" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Afternoon Section */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 700, color: "#ea580c", marginBottom: "4px" }}>
              <Sun size={12} /> Afternoon
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "4px" }}>
              {AFTERNOON_SLOTS.map((slot) => {
                const isSel = selectedSlot === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    style={{
                      padding: "5px 8px",
                      borderRadius: "6px",
                      border: isSel ? "1.5px solid #0284c7" : "1px solid #e2e8f0",
                      background: isSel ? "#f0f9ff" : "#ffffff",
                      color: isSel ? "#0369a1" : "#334155",
                      fontSize: "11px",
                      fontWeight: isSel ? 700 : 500,
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "all 0.12s ease",
                    }}
                  >
                    <span>{slot}</span>
                    {isSel && <Check size={12} color="#0284c7" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Evening Section */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 700, color: "#4f46e5", marginBottom: "4px" }}>
              <Sunset size={12} /> Evening
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "4px" }}>
              {EVENING_SLOTS.map((slot) => {
                const isSel = selectedSlot === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    style={{
                      padding: "5px 8px",
                      borderRadius: "6px",
                      border: isSel ? "1.5px solid #0284c7" : "1px solid #e2e8f0",
                      background: isSel ? "#f0f9ff" : "#ffffff",
                      color: isSel ? "#0369a1" : "#334155",
                      fontSize: "11px",
                      fontWeight: isSel ? 700 : 500,
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "all 0.12s ease",
                    }}
                  >
                    <span>{slot}</span>
                    {isSel && <Check size={12} color="#0284c7" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Custom Time Mode */
        <div style={{ padding: "8px 0" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "8px",
              padding: "16px 8px",
              background: "#f8fafc",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              marginBottom: "12px",
            }}
          >
            {/* Hour select */}
            <select
              value={hour}
              onChange={(e) => setHour(e.target.value)}
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "#0f172a",
                padding: "6px 8px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {Array.from({ length: 12 }).map((_, i) => {
                const h = String(i + 1).padStart(2, "0");
                return (
                  <option key={h} value={h}>
                    {h}
                  </option>
                );
              })}
            </select>

            <span style={{ fontSize: "20px", fontWeight: 700, color: "#64748b" }}>:</span>

            {/* Minute select */}
            <select
              value={minute}
              onChange={(e) => setMinute(e.target.value)}
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "#0f172a",
                padding: "6px 8px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {["00", "15", "30", "45"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {/* AM / PM selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <button
                type="button"
                onClick={() => setPeriod("AM")}
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  border: "none",
                  background: period === "AM" ? "#0284c7" : "#e2e8f0",
                  color: period === "AM" ? "#ffffff" : "#475467",
                  fontSize: "10px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => setPeriod("PM")}
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  border: "none",
                  background: period === "PM" ? "#0284c7" : "#e2e8f0",
                  color: period === "PM" ? "#ffffff" : "#475467",
                  fontSize: "10px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                PM
              </button>
            </div>
          </div>

          {/* Quick presets for custom time */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {[
              { h: "09", m: "00", p: "AM" as const, label: "09:00 AM" },
              { h: "11", m: "30", p: "AM" as const, label: "11:30 AM" },
              { h: "02", m: "00", p: "PM" as const, label: "02:00 PM" },
              { h: "04", m: "30", p: "PM" as const, label: "04:30 PM" },
              { h: "06", m: "00", p: "PM" as const, label: "06:00 PM" },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setHour(p.h);
                  setMinute(p.m);
                  setPeriod(p.p);
                }}
                style={{
                  padding: "3px 6px",
                  borderRadius: "4px",
                  background: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  color: "#334155",
                  fontSize: "10px",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: "10px",
          paddingTop: "8px",
          borderTop: "1px solid #f1f5f9",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div style={{ fontSize: "9.5px", color: "#64748b" }}>Selected:</div>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#0369a1",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {currentSelection}
          </div>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          style={{
            padding: "5px 12px",
            borderRadius: "6px",
            background: "#0284c7",
            color: "#ffffff",
            border: "none",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            boxShadow: "0 1px 3px rgba(2, 132, 199, 0.3)",
          }}
        >
          <Check size={12} /> Confirm
        </button>
      </div>
    </div>
  );
}
