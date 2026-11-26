"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Tag, Button, Tooltip, Alert, Skeleton, Modal, Input, Form, Popconfirm, message, Select } from "antd";
import {
  RefreshCw,
  AppWindow,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  Hash,
  Trash2,
} from "lucide-react";
import styles from "./subscribed-apps.module.css";

interface SubscribedApp {
  id: string;
  name: string;
  link: string;
  isActive?: boolean;
}

interface PageData {
  wabaId: string;
  apps: SubscribedApp[];
  subscriptionPosted: boolean;
  postedAt?: string;
}

type LoadState = "idle" | "loading" | "done" | "error";

export default function SubscribedAppsPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [subscribing, setSubscribing] = useState(false);
  const [deletingAppId, setDeletingAppId] = useState<string | null>(null);
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  const [subscribeResult, setSubscribeResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [form] = Form.useForm();

  const fetchApps = useCallback(async (refresh = false) => {
    if (refresh) {
      setLoadState("loading");
    }
    setErrorMsg("");
    try {
      const res = await fetch(`/api/subscribed-apps${refresh ? "?refresh=true" : ""}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
        setLoadState("done");
      } else {
        setErrorMsg(json.error?.message || "Failed to load subscribed apps.");
        setLoadState("error");
      }
    } catch {
      setErrorMsg("Network error — could not reach the engine API.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (mounted) {
        await fetchApps();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [fetchApps]);

  const handleSubscribe = async (values?: {
    appName?: string;
    appId?: string;
    webhookUrl?: string;
    verifyToken?: string;
    subscribedFields?: string[];
  }) => {
    setSubscribing(true);
    setSubscribeResult(null);
    try {
      const res = await fetch("/api/subscribed-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: values?.appId?.trim() || undefined,
          appName: values?.appName?.trim() || undefined,
          webhookUrl: values?.webhookUrl?.trim() || undefined,
          verifyToken: values?.verifyToken?.trim() || undefined,
          subscribedFields: values?.subscribedFields || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setLoadState("done");
        setSubscribeModalOpen(false);
        form.resetFields();
        message.success(`Successfully subscribed app to WABA ${json.data.wabaId}!`);
        setSubscribeResult({
          type: "success",
          message: `Successfully subscribed! ${json.data.apps.length} app(s) now active on WABA ${json.data.wabaId}.`,
        });
      } else {
        message.error(json.error?.message || "Subscription failed.");
        setSubscribeResult({
          type: "error",
          message: json.error?.message || "Subscription failed.",
        });
      }
    } catch {
      message.error("Network error — could not reach the engine API.");
      setSubscribeResult({
        type: "error",
        message: "Network error — could not reach the engine API.",
      });
    } finally {
      setSubscribing(false);
    }
  };

  const handleUnsubscribe = async (appId: string) => {
    setDeletingAppId(appId);
    try {
      const res = await fetch(`/api/subscribed-apps?appId=${encodeURIComponent(appId)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        message.success(`App ${appId} successfully unsubscribed from WABA!`);
      } else {
        message.error(json.error?.message || "Failed to unsubscribe app.");
      }
    } catch (err: any) {
      message.error(err.message || "Network error while unsubscribing app.");
    } finally {
      setDeletingAppId(null);
    }
  };

  const isLoading = loadState === "loading";
  const handleSwitchActiveApp = async (appId: string) => {
    try {
      const res = await fetch("/api/auth/switch-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wabaId: data?.wabaId, projectId: appId }),
      });
      const json = await res.json();
      if (json.success) {
        message.success("Active App switched");
        fetchApps();
        window.location.reload();
      } else {
        message.error(json.error?.message || "Failed to switch active app");
      }
    } catch {
      message.error("Failed to switch active app");
    }
  };

  const hasApps = (data?.apps?.length ?? 0) > 0;

  return (
    <div className={styles.container}>
      {/* Top Header */}
      <div className={styles.topBar}>
        <div className={styles.headerText}>
          <div className={styles.titleRow}>
            <div className={styles.headerIcon}>
              <AppWindow size={20} />
            </div>
            <div>
              <h1 className={styles.title}>Subscribed Apps</h1>
              <p className={styles.subtitle}>
                Apps connected to your WhatsApp Business Account (WABA) via Meta Graph API.
                Each subscribed app receives webhooks for messages, deliveries, and status updates.
              </p>
            </div>
          </div>
        </div>

        <div className={styles.headerActions}>
          <Tooltip title="Subscribe a Meta app to this WABA">
            <Button
              icon={<PlusCircle size={15} />}
              onClick={() => setSubscribeModalOpen(true)}
              loading={subscribing}
              disabled={isLoading}
              type="primary"
              className={styles.primaryBtn}
            >
              Subscribe App
            </Button>
          </Tooltip>
          <Tooltip title="Refresh subscriptions from Meta Graph API">
            <Button
              icon={<RefreshCw size={14} className={isLoading ? styles.spinning : ""} />}
              onClick={() => fetchApps(true)}
              loading={isLoading}
              disabled={isLoading}
              className={styles.refreshBtn}
            >
              Refresh
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* WABA ID Meta Bar */}
      {data?.wabaId && (
        <div className={styles.wabaBanner}>
          <div className={styles.wabaBannerLeft}>
            <span className={styles.wabaBannerLabel}>Active WABA</span>
            <span className={styles.wabaBadge}>
              <Hash size={13} className={styles.hashIcon} />
              <code>{data.wabaId}</code>
            </span>
          </div>
          <div className={styles.wabaBannerRight}>
            <Tag color="processing" className={styles.tagApi}>
              Meta Graph API v25.0
            </Tag>
            <Tag color={hasApps ? "success" : "warning"} className={styles.tagStatus}>
              {hasApps ? `${data.apps.length} App(s) Connected` : "No Subscriptions"}
            </Tag>
          </div>
        </div>
      )}

      {/* Feedback Alerts */}
      {subscribeResult && (
        <div className={styles.alertWrap}>
          <Alert
            type={subscribeResult.type}
            message={subscribeResult.message}
            showIcon
            closable
            onClose={() => setSubscribeResult(null)}
          />
        </div>
      )}

      {/* Error State */}
      {loadState === "error" && (
        <div className={styles.alertWrap}>
          <Alert
            type="error"
            showIcon
            message="Failed to load subscribed apps"
            description={errorMsg}
            action={
              <Button size="small" onClick={() => fetchApps(true)}>
                Retry
              </Button>
            }
          />
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className={styles.skeletonGrid}>
          {[1, 2].map((i) => (
            <div key={i} className={styles.skeletonCard}>
              <Skeleton active paragraph={{ rows: 3 }} />
            </div>
          ))}
        </div>
      )}

      {/* Apps Section */}
      {!isLoading && loadState === "done" && (
        <>
          {hasApps ? (
            <div className={styles.sectionWrap}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitleGroup}>
                  <CheckCircle2 size={16} className={styles.checkIcon} />
                  <span className={styles.sectionTitle}>
                    Connected Webhook Subscribers
                  </span>
                </div>
                <span className={styles.counterBadge}>
                  {data!.apps.length} active
                </span>
              </div>

              <div className={styles.appsGrid}>
                {data!.apps.map((app) => (
                  <div key={app.id} className={styles.appCard}>
                    <div className={styles.appCardTop}>
                      <div className={styles.appIconWrapper}>
                        <AppWindow size={20} />
                      </div>
                      <div className={styles.appMeta}>
                        <div className={styles.appName} title={app.name}>
                          {app.name}
                        </div>
                        <Tag color="cyan" className={styles.subscribedTag}>
                          Active Webhook Subscriber
                        </Tag>
                      </div>
                    </div>

                    <div className={styles.appDetails}>
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Meta App ID</span>
                        <code className={styles.detailValue}>{app.id}</code>
                      </div>
                      {app.link ? (
                        <div className={styles.detailRow}>
                          <span className={styles.detailLabel}>App Webhook URL</span>
                          <a
                            href={app.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.appLink}
                            title={app.link}
                          >
                            <span className={styles.linkText}>
                              {app.link.length > 45 ? app.link.slice(0, 45) + "…" : app.link}
                            </span>
                            <ExternalLink size={12} className={styles.extIcon} />
                          </a>
                        </div>
                      ) : null}
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Meta Portal</span>
                        <a
                          href={app.id ? `https://developers.facebook.com/apps/${app.id}` : "https://developers.facebook.com"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.appLinkPortal}
                        >
                          <span>Open in Developer Portal</span>
                          <ExternalLink size={12} className={styles.extIcon} />
                        </a>
                      </div>

                      <div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid var(--stroke)", display: "flex", flexDirection: "column", gap: 8 }}>
                        {app.isActive ? (
                          <Button
                            type="primary"
                            icon={<CheckCircle2 size={14} />}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              background: "var(--brand)",
                              fontWeight: 600,
                              height: 36,
                              borderRadius: 8,
                            }}
                          >
                            Active App
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleSwitchActiveApp(app.id)}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              fontWeight: 600,
                              height: 36,
                              borderRadius: 8,
                            }}
                          >
                            Switch to this App
                          </Button>
                        )}
                        <Popconfirm
                          title="Unsubscribe App from WABA?"
                          description={`Are you sure you want to remove app ${app.name} (${app.id}) from webhook subscriptions?`}
                          onConfirm={() => handleUnsubscribe(app.id)}
                          okText="Unsubscribe"
                          cancelText="Cancel"
                          okButtonProps={{ danger: true }}
                        >
                          <Button
                            danger
                            size="small"
                            icon={<Trash2 size={13} />}
                            loading={deletingAppId === app.id}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              background: "rgba(239, 68, 68, 0.12)",
                              borderColor: "rgba(239, 68, 68, 0.35)",
                              color: "#f87171",
                              fontWeight: 600,
                              height: 36,
                              borderRadius: 8,
                            }}
                          >
                            Unsubscribe App
                          </Button>
                        </Popconfirm>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <AlertTriangle size={28} />
              </div>
              <h3 className={styles.emptyTitle}>No Subscribed Apps Found</h3>
              <p className={styles.emptyDesc}>
                Your WhatsApp Business Account (WABA) <code>{data?.wabaId}</code> currently has no apps subscribed.
                Subscribing links your Meta App to this WABA so it can receive inbound customer messages,
                delivery receipts, and status updates.
              </p>
              <Button
                type="primary"
                icon={<PlusCircle size={15} />}
                onClick={() => setSubscribeModalOpen(true)}
                loading={subscribing}
                className={styles.emptyCta}
              >
                Subscribe App to WABA
              </Button>
            </div>
          )}
        </>
      )}

      {/* Dynamic Subscribe App Modal */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AppWindow size={18} color="var(--brand)" />
            <span>Connect & Subscribe Meta App to WABA</span>
          </div>
        }
        open={subscribeModalOpen}
        onCancel={() => {
          setSubscribeModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        destroyOnClose
        width={560}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubscribe}
          initialValues={{
            appId: "1463305155841443",
            appName: "WhatsApp Production Engine",
            webhookUrl: "https://your-domain.com/webhooks/whatsapp/meta",
            verifyToken: "wac_meta_webhook_verify_token_2026",
            subscribedFields: ["messages", "messaging_postbacks", "message_deliveries"],
          }}
          style={{ marginTop: 16 }}
        >
          <Form.Item label="Target WABA ID">
            <Input value={data?.wabaId} disabled style={{ fontFamily: "monospace" }} />
          </Form.Item>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Form.Item
              name="appName"
              label="App Display Name"
              rules={[{ required: true, message: "Please enter an app display name" }]}
            >
              <Input placeholder="e.g. WhatsApp Production Engine" />
            </Form.Item>

            <Form.Item
              name="appId"
              label="Meta App ID"
              rules={[{ required: true, message: "Meta App ID is required" }]}
              extra="Your registered Meta Application identifier"
            >
              <Input placeholder="e.g. 1463305155841443" style={{ fontFamily: "monospace" }} />
            </Form.Item>
          </div>

          <Form.Item
            name="webhookUrl"
            label="Webhook Callback URL"
            extra="The public HTTPS endpoint where Meta will POST inbound webhook updates"
          >
            <Input placeholder="https://your-domain.com/webhooks/whatsapp/meta" prefix={<ExternalLink size={13} color="#6b7280" />} />
          </Form.Item>

          <Form.Item
            name="verifyToken"
            label="Verification Token (Hub Secret)"
            extra="The webhook challenge verification token configured in Meta App Dashboard"
          >
            <Input.Password placeholder="wac_meta_webhook_verify_token_2026" />
          </Form.Item>

          <Form.Item
            name="subscribedFields"
            label="Subscribed Webhook Fields"
            extra="Select the event types your app should receive from this WABA"
          >
            <Select
              mode="multiple"
              placeholder="Select event fields"
              options={[
                { value: "messages", label: "messages (Customer inbound messages)" },
                { value: "messaging_postbacks", label: "messaging_postbacks (Interactive button clicks)" },
                { value: "message_deliveries", label: "message_deliveries (Sent/Delivered/Read receipts)" },
                { value: "message_template_status_update", label: "message_template_status_update (Template approvals)" },
                { value: "phone_number_quality_update", label: "phone_number_quality_update (Tier & health alerts)" },
              ]}
            />
          </Form.Item>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <Button onClick={() => setSubscribeModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={subscribing}
              style={{ backgroundColor: "var(--wa-primary)" }}
            >
              Subscribe App to WABA
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
