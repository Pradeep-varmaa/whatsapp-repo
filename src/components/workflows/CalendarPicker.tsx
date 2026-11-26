"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Check, X } from "lucide-react";

export interface CalendarPickerProps {
  value?: string; // YYYY-MM-DD
  onSelect: (isoDate: string, formattedDate: string) => void;
  onClose?: () => void;
  title?: string;
  minDate?: Date;
  allowPastDates?: boolean;
  inline?: boolean;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function CalendarPicker({
  value,
  onSelect,
  onClose,
  title = "Select Date",
  minDate,
  allowPastDates = false,
  inline = false,
}: CalendarPickerProps) {
  const parseInitialDate = () => {
    if (value) {
      const parts = value.split("-").map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
      }
    }
    return new Date();
  };

  const initial = parseInitialDate();
  const [viewDate, setViewDate] = useState<Date>(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date>(initial);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const effectiveMinDate = minDate ? new Date(minDate) : today;
  if (!allowPastDates) {
    effectiveMinDate.setHours(0, 0, 0, 0);
  }

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonthDays = new Date(year, month, 0).getDate();

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const formatISO = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const formatDisplay = (d: Date): string => {
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleSelectDay = (dayNum: number) => {
    const d = new Date(year, month, dayNum);
    d.setHours(0, 0, 0, 0);
    if (!allowPastDates && d < effectiveMinDate) return;
    setSelectedDate(d);
  };

  const handleQuickSelect = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
    setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const handleConfirm = () => {
    onSelect(formatISO(selectedDate), formatDisplay(selectedDate));
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const isSelected = (dayNum: number) => {
    return (
      selectedDate.getFullYear() === year &&
      selectedDate.getMonth() === month &&
      selectedDate.getDate() === dayNum
    );
  };

  const isToday = (dayNum: number) => {
    return (
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === dayNum
    );
  };

  const isPast = (dayNum: number) => {
    const d = new Date(year, month, dayNum);
    d.setHours(0, 0, 0, 0);
    return !allowPastDates && d < effectiveMinDate;
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
      {/* Header with Title and Close Button */}
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
          <CalendarIcon size={15} color="#0f766e" />
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

      {/* Quick Select Buttons (Today, Tomorrow, +7 Days) */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "10px" }}>
        <button
          type="button"
          onClick={() => handleQuickSelect(0)}
          style={{
            flex: 1,
            padding: "4px 6px",
            borderRadius: "5px",
            fontSize: "10.5px",
            fontWeight: 600,
            background: isSameDay(selectedDate, today) ? "#0f766e" : "#f1f5f9",
            color: isSameDay(selectedDate, today) ? "#ffffff" : "#334155",
            border: "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => handleQuickSelect(1)}
          style={{
            flex: 1,
            padding: "4px 6px",
            borderRadius: "5px",
            fontSize: "10.5px",
            fontWeight: 600,
            background:
              selectedDate.getDate() === today.getDate() + 1 &&
              selectedDate.getMonth() === today.getMonth() &&
              selectedDate.getFullYear() === today.getFullYear()
                ? "#0f766e"
                : "#f1f5f9",
            color:
              selectedDate.getDate() === today.getDate() + 1 &&
              selectedDate.getMonth() === today.getMonth() &&
              selectedDate.getFullYear() === today.getFullYear()
                ? "#ffffff"
                : "#334155",
            border: "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          Tomorrow
        </button>
        <button
          type="button"
          onClick={() => handleQuickSelect(7)}
          style={{
            flex: 1,
            padding: "4px 6px",
            borderRadius: "5px",
            fontSize: "10.5px",
            fontWeight: 600,
            background: "#f1f5f9",
            color: "#334155",
            border: "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          +7 Days
        </button>
      </div>

      {/* Month Navigation */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <button
          type="button"
          onClick={handlePrevMonth}
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "5px",
            width: "26px",
            height: "26px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#475467",
          }}
        >
          <ChevronLeft size={14} />
        </button>
        <div style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b" }}>
          {MONTH_NAMES[month]} {year}
        </div>
        <button
          type="button"
          onClick={handleNextMonth}
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "5px",
            width: "26px",
            height: "26px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#475467",
          }}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Weekday Headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "2px",
          textAlign: "center",
          marginBottom: "4px",
        }}
      >
        {WEEKDAY_NAMES.map((w, idx) => (
          <div
            key={idx}
            style={{
              fontSize: "10px",
              fontWeight: 700,
              color: idx === 0 || idx === 6 ? "#94a3b8" : "#64748b",
              padding: "2px 0",
            }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "2px",
          textAlign: "center",
          marginBottom: "10px",
        }}
      >
        {/* Previous Month trailing days */}
        {Array.from({ length: firstDayIndex }).map((_, i) => (
          <div
            key={`prev_${i}`}
            style={{
              fontSize: "11px",
              color: "#cbd5e1",
              padding: "6px 0",
              opacity: 0.4,
            }}
          >
            {prevMonthDays - firstDayIndex + i + 1}
          </div>
        ))}

        {/* Current Month days */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const selected = isSelected(dayNum);
          const past = isPast(dayNum);
          const currentDay = isToday(dayNum);

          return (
            <button
              key={dayNum}
              type="button"
              disabled={past}
              onClick={() => handleSelectDay(dayNum)}
              style={{
                background: selected
                  ? "#0f766e"
                  : currentDay
                  ? "#e0f2fe"
                  : "transparent",
                color: selected
                  ? "#ffffff"
                  : past
                  ? "#cbd5e1"
                  : currentDay
                  ? "#0369a1"
                  : "#1e293b",
                border: currentDay && !selected ? "1px solid #38bdf8" : "none",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: selected || currentDay ? 700 : 500,
                padding: "6px 0",
                cursor: past ? "not-allowed" : "pointer",
                transition: "all 0.12s ease",
                position: "relative",
              }}
            >
              {dayNum}
            </button>
          );
        })}
      </div>

      {/* Selected Date Summary & Confirm Action */}
      <div
        style={{
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
              color: "#0f766e",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {formatDisplay(selectedDate)}
          </div>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          style={{
            padding: "5px 12px",
            borderRadius: "6px",
            background: "#0f766e",
            color: "#ffffff",
            border: "none",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            boxShadow: "0 1px 3px rgba(15, 118, 110, 0.3)",
          }}
        >
          <Check size={12} /> Confirm
        </button>
      </div>
    </div>
  );
}
