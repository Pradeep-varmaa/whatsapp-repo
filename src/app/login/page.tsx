"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Button, Alert } from "antd";
import {
  MessageSquare,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  UserCog,
  Sparkles,
} from "lucide-react";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@whatsapp.engine");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [bypassLoading, setBypassLoading] = useState<"admin" | "subadmin" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const doLogin = async (loginEmail?: string, loginPassword?: string, bypassType?: "admin" | "subadmin") => {
    setErrorMsg("");
    const targetEmail = loginEmail || email;
    const targetPassword = loginPassword || password;

    if (bypassType) {
      setBypassLoading(bypassType);
    } else {
      setLoading(true);
    }

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, password: targetPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        window.location.href = "/overview";
      } else {
        setErrorMsg(data.error?.message || "Login failed.");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setLoading(false);
      setBypassLoading(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doLogin();
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginCard}>
        <div className={styles.header}>
          <div className={styles.brandIcon}>
            <MessageSquare size={26} />
          </div>
          <h1 className={styles.title}>WhatsApp Engine</h1>
          <p className={styles.subtitle}>
            Live Meta Cloud API v25.0 Communication Engine.
          </p>
        </div>

        {errorMsg && (
          <Alert message={errorMsg} type="error" showIcon closable onClose={() => setErrorMsg("")} />
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Email Address</label>
            <Input
              size="large"
              prefix={<Mail size={16} style={{ color: "#9CA3AF", marginRight: 6 }} />}
              placeholder="admin@whatsapp.engine"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <Input.Password
              size="large"
              prefix={<Lock size={16} style={{ color: "#9CA3AF", marginRight: 6 }} />}
              placeholder="Any password..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button
            type="primary"
            htmlType="submit"
            loading={loading && !bypassLoading}
            icon={<ArrowRight size={16} />}
            iconPosition="end"
            className={styles.submitBtn}
            block
          >
            Enter Dashboard
          </Button>

          <div className={styles.divider}>
            <span>Quick 1-Click Bypass Logins</span>
          </div>

          <div className={styles.bypassGrid}>
            {/* Administrator Bypass */}
            <button
              type="button"
              className={styles.bypassCard}
              disabled={loading || bypassLoading !== null}
              onClick={() => {
                setEmail("admin@whatsapp.engine");
                setPassword("admin123");
                doLogin("admin@whatsapp.engine", "admin123", "admin");
              }}
            >
              <div className={styles.bypassHeader}>
                <ShieldCheck size={16} color="#075E54" />
                <span>Administrator</span>
              </div>
              <span className={styles.bypassSub}>Full Access & Account Control</span>
              <span className={styles.bypassEmail}>
                {bypassLoading === "admin" ? "Logging in..." : "admin@whatsapp.engine"}
              </span>
            </button>

            {/* Subadministrator Bypass */}
            <button
              type="button"
              className={styles.bypassCardSub}
              disabled={loading || bypassLoading !== null}
              onClick={() => {
                setEmail("subadmin@whatsapp.engine");
                setPassword("subadmin123");
                doLogin("subadmin@whatsapp.engine", "subadmin123", "subadmin");
              }}
            >
              <div className={styles.bypassHeader}>
                <UserCog size={16} color="#0284C7" />
                <span>Subadministrator</span>
              </div>
              <span className={styles.bypassSub}>App & Operations Manager</span>
              <span className={styles.bypassEmailSub}>
                {bypassLoading === "subadmin" ? "Logging in..." : "subadmin@whatsapp.engine"}
              </span>
            </button>
          </div>
        </form>

        <div className={styles.demoBox}>
          <span className={styles.demoTitle}>Role-Based Bypass Active:</span>
          <div>
            Click <strong>Administrator</strong> for full platform privileges or <strong>Subadministrator</strong> for operational workflows.
          </div>
        </div>
      </div>
    </div>
  );
}
