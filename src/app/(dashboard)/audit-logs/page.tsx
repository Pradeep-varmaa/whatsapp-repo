"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Table, Tag, Input, Select, Button, message } from "antd";
import {
  Download,
  Filter,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Calendar,
  Lock,
} from "lucide-react";
import { AuditLogRecord } from "@/shared/types";
import styles from "./audit-logs.module.css";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ role: string; email: string } | null>(null);

  // Filter states
  const [outcome, setOutcome] = useState<string>("all");
  const [event, setEvent] = useState<string>("all");
  const [keyPrefix, setKeyPrefix] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  // Check user role
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setCurrentUser({
            role: json.data.role.toLowerCase(),
            email: json.data.email,
          });
        }
      })
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (outcome && outcome !== "all") params.set("outcome", outcome);
    if (event && event !== "all") params.set("event", event);
    if (keyPrefix.trim()) params.set("keyPrefix", keyPrefix.trim());
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    params.set("page", String(page));
    params.set("limit", String(pageSize));

    fetch(`/api/v1/audit-logs?${params.toString()}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          setLogs(res.data);
          setTotal(res.meta?.total || res.data.length);
        } else if (res.error) {
          message.error(res.error.message || "Failed to fetch audit logs");
        }
      })
      .catch((err) => {
        message.error("Failed to load audit logs: " + err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [outcome, event, keyPrefix, startDate, endDate, page, pageSize]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExportCsv = () => {
    if (currentUser?.role !== "superadmin") {
      message.error("Superadmin permission required for CSV export");
      return;
    }

    const params = new URLSearchParams();
    if (outcome && outcome !== "all") params.set("outcome", outcome);
    if (event && event !== "all") params.set("event", event);
    if (keyPrefix.trim()) params.set("keyPrefix", keyPrefix.trim());
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    window.open(`/api/v1/audit-logs/export?${params.toString()}`, "_blank");
    message.success("Generating CSV export...");
  };

  const isSuperadmin = currentUser?.role === "superadmin";

  const columns = [
    {
      title: "Timestamp",
      dataIndex: "timestamp",
      key: "timestamp",
      width: 170,
      render: (ts: string) => (
        <span className={styles.timeCell}>
          {new Date(ts).toLocaleString([], {
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      ),
    },
    {
      title: "Event",
      dataIndex: "event",
      key: "event",
      render: (evt: string) => {
        let tagColor = "blue";
        if (evt === "message_sent") tagColor = "green";
        else if (evt === "key_created") tagColor = "cyan";
        else if (evt === "key_revoked") tagColor = "orange";
        else if (evt.includes("failed") || evt.includes("error") || evt === "rate_limited") tagColor = "red";

        return (
          <Tag color={tagColor} className={styles.eventTag}>
            {evt}
          </Tag>
        );
      },
    },
    {
      title: "Outcome",
      dataIndex: "outcome",
      key: "outcome",
      width: 120,
      render: (out: string) => {
        const isSuccess = out === "success";
        return (
          <span className={isSuccess ? styles.badgeSuccess : styles.badgeFailure}>
            {isSuccess ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
            {out}
          </span>
        );
      },
    },
    {
      title: "Reason",
      dataIndex: "reason",
      key: "reason",
      render: (r: string | null) =>
        r ? (
          <code className={styles.reasonCode}>{r}</code>
        ) : (
          <span className={styles.mutedText}>—</span>
        ),
    },
    {
      title: "Key Prefix",
      dataIndex: "key_prefix",
      key: "key_prefix",
      render: (p: string | null) =>
        p ? (
          <span className={styles.prefixCode}>{p}••••</span>
        ) : (
          <span className={styles.mutedText}>—</span>
        ),
    },
    {
      title: "Recipient",
      dataIndex: "recipient_masked",
      key: "recipient_masked",
      render: (phone: string | null) =>
        phone ? (
          <span className={styles.recipientMasked}>{phone}</span>
        ) : (
          <span className={styles.mutedText}>—</span>
        ),
    },
    {
      title: "IP Address",
      dataIndex: "ip",
      key: "ip",
      render: (ip: string | null) => (
        <span className={styles.ipText}>{ip || "127.0.0.1"}</span>
      ),
    },
    {
      title: "Status",
      dataIndex: "http_status",
      key: "http_status",
      width: 90,
      render: (status: number) => {
        let statusClass = styles.statusOk;
        if (status >= 400 && status < 500) statusClass = styles.statusWarn;
        else if (status >= 500) statusClass = styles.statusErr;
        return <span className={statusClass}>{status}</span>;
      },
    },
  ];

  return (
    <div className={styles.container}>
      {/* Top Banner */}
      <div className={`glass-strong ${styles.banner}`}>
        <div className={styles.bannerLeft}>
          <h2 className={styles.title}>System Audit Logs</h2>
          <p className={styles.subtitle}>
            Append-only tamper-evident security records for API authentication, rate limits, and message dispatches.
          </p>
        </div>
        <div className={styles.bannerActions}>
          <button
            onClick={() => fetchLogs()}
            className="btn-secondary"
            style={{ padding: "8px 16px", fontSize: 13 }}
            title="Refresh logs"
          >
            <RefreshCw size={15} />
            <span>Refresh</span>
          </button>
          {isSuperadmin && (
            <button
              onClick={handleExportCsv}
              className="btn-primary"
              style={{ padding: "8px 16px", fontSize: 13 }}
            >
              <Download size={15} />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className={`glass ${styles.filterBar}`}>
        <div className={styles.filterGroup}>
          <Filter size={15} className={styles.filterIcon} />
          <span className={styles.filterLabel}>Filters:</span>
        </div>

        {/* Outcome Filter */}
        <Select
          value={outcome}
          onChange={(val) => {
            setOutcome(val);
            setPage(1);
          }}
          className={styles.selectFilter}
          options={[
            { value: "all", label: "All Outcomes" },
            { value: "success", label: "Success only" },
            { value: "failure", label: "Failure only" },
          ]}
        />

        {/* Event Filter */}
        <Select
          value={event}
          onChange={(val) => {
            setEvent(val);
            setPage(1);
          }}
          className={styles.selectFilter}
          options={[
            { value: "all", label: "All Events" },
            { value: "message_sent", label: "message_sent" },
            { value: "key_created", label: "key_created" },
            { value: "key_revoked", label: "key_revoked" },
            { value: "auth_failed", label: "auth_failed" },
            { value: "forbidden", label: "forbidden" },
            { value: "validation_failed", label: "validation_failed" },
            { value: "rate_limited", label: "rate_limited" },
            { value: "meta_error", label: "meta_error" },
          ]}
        />

        {/* Key Prefix Search */}
        <Input
          placeholder="Filter by key prefix..."
          value={keyPrefix}
          onChange={(e) => {
            setKeyPrefix(e.target.value);
            setPage(1);
          }}
          className={`glass-input ${styles.keyInput}`}
          allowClear
        />

        {/* Date Range Inputs */}
        <div className={styles.dateRangeGroup}>
          <Calendar size={14} className={styles.calendarIcon} />
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className={styles.dateInput}
            title="Start Date"
          />
          <span className={styles.dateSep}>→</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className={styles.dateInput}
            title="End Date"
          />
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className={`glass ${styles.tableCard}`}>
        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          scroll={{ x: 900 }}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p) => setPage(p),
            showTotal: (totalCount) => `${totalCount} total audit records`,
          }}
        />
      </div>
    </div>
  );
}
