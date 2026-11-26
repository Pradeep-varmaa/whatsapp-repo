"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Form,
  Input,
  Button,
  Radio,
  Select,
  Tag,
  Alert,
  Tooltip,
  Tabs,
  Badge,
  message,
  Card,
  Spin,
} from "antd";
import {
  Send,
  Code2,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Terminal,
  HelpCircle,
  ExternalLink,
  KeyRound,
  FileText,
  MessageSquare,
  AlertCircle,
  Clock,
  ArrowRight,
} from "lucide-react";
import styles from "./demo.module.css";

interface ApiKeyOption {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
}

interface TemplateOption {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  bodySnippet?: string;
  components?: any[];
}

function extractPlaceholders(text?: string | null): string[] {
  if (!text) return [];
  const matches = text.match(/\{\{(\d+|[a-zA-Z0-9_]+)\}\}/g);
  if (!matches) return [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const m of matches) {
    const key = m.replace(/[\{\}]/g, "");
    if (!seen.has(key)) {
      seen.add(key);
      list.push(key);
    }
  }
  return list;
}

function getPlaceholderSuggestion(key: string, idx: number, tplName: string): string {
  const lower = tplName.toLowerCase();
  if (lower.includes("order") || lower.includes("confirm")) {
    if (idx === 0 || key === "1") return "John Doe";
    if (idx === 1 || key === "2") return "ORD-94812";
    if (idx === 2 || key === "3") return "Tomorrow by 5:00 PM";
    if (idx === 3 || key === "4") return "Farm Fresh Produce";
  }
  if (lower.includes("shipping") || lower.includes("deliver")) {
    if (idx === 0 || key === "1") return "John";
    if (idx === 1 || key === "2") return "TRACK-88219";
    if (idx === 2 || key === "3") return "FedEx Express";
  }
  if (lower.includes("otp") || lower.includes("code") || lower.includes("auth")) {
    if (idx === 0 || key === "1") return "849201";
    if (idx === 1 || key === "2") return "10 minutes";
  }
  if (lower.includes("market") || lower.includes("specials") || lower.includes("promo")) {
    if (idx === 0 || key === "1") return "Alex";
    if (idx === 1 || key === "2") return "Weekend Super Sale";
    if (idx === 2 || key === "3") return "25% OFF";
  }
  if (idx === 0 || key === "1") return "Customer Name";
  if (idx === 1 || key === "2") return "Sample Value";
  if (idx === 2 || key === "3") return "Reference 123";
  return `Value ${key}`;
}

const DEFAULT_HELLO_WORLD: TemplateOption = {
  id: "meta_hello_world",
  name: "hello_world",
  status: "APPROVED",
  category: "UTILITY",
  language: "en_US",
  bodySnippet: "Hello World standard sample template pre-configured in Meta WhatsApp Business accounts.",
  components: [
    {
      type: "BODY",
      text: "Hello World",
    },
  ],
};

export default function MessageDemoPage() {
  const [form] = Form.useForm();
  const [messageType, setMessageType] = useState<"template" | "text">("template");
  const [authMode, setAuthMode] = useState<"session" | "custom">("session");
  const [availableKeys, setAvailableKeys] = useState<ApiKeyOption[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<TemplateOption[]>([DEFAULT_HELLO_WORLD]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isCustomTemplate, setIsCustomTemplate] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Dynamic template placeholder variables
  const [bodyVariables, setBodyVariables] = useState<Record<string, string>>({});
  const [headerVariables, setHeaderVariables] = useState<Record<string, string>>({});

  // Live Inspector Output
  const [lastResponse, setLastResponse] = useState<{
    status: number;
    statusText: string;
    durationMs: number;
    headers: Record<string, string>;
    data: any;
    timestamp: string;
  } | null>(null);

  // Form values watched for live preview
  const [watchedValues, setWatchedValues] = useState<any>({
    endpoint: "/v1/api/message",
    to: "+15551234567",
    type: "template",
    templateName: "hello_world",
    templateLanguage: "en_US",
    textBody: "Hello from WhatsApp Engine live demo!",
    idempotencyKey: "demo_msg_sample",
    customApiKey: "",
  });

  const syncTemplateVariables = (template: TemplateOption | undefined) => {
    if (!template) {
      setBodyVariables({});
      setHeaderVariables({});
      return;
    }

    const bComp = template.components?.find((c: any) => c.type?.toUpperCase() === "BODY");
    const bText = bComp?.text || template.bodySnippet || "";
    const bKeys = extractPlaceholders(bText);
    const bExamples = bComp?.example?.body_text?.[0] || [];

    const newBodyVars: Record<string, string> = {};
    bKeys.forEach((key, idx) => {
      newBodyVars[key] = bExamples[idx] || getPlaceholderSuggestion(key, idx, template.name);
    });
    setBodyVariables(newBodyVars);

    const hComp = template.components?.find((c: any) => c.type?.toUpperCase() === "HEADER");
    const hFormat = hComp?.format?.toUpperCase() || (hComp?.text ? "TEXT" : undefined);
    const hText = hComp?.text || "";
    const hKeys = hFormat === "TEXT" ? extractPlaceholders(hText) : [];
    const hExamples = hComp?.example?.header_text || [];

    const newHeaderVars: Record<string, string> = {};
    hKeys.forEach((key, idx) => {
      newHeaderVars[key] = hExamples[idx] || `Header Value ${key}`;
    });
    setHeaderVariables(newHeaderVars);
  };

  // Fetch available API keys and Meta templates on mount
  useEffect(() => {
    let isMounted = true;
    const loadInitialData = async () => {
      setIsLoadingKeys(true);
      setIsLoadingTemplates(true);
      try {
        const [keysRes, templatesRes] = await Promise.all([
          fetch("/api/api-keys").catch(() => null),
          fetch("/api/v1/meta/templates").catch(() => null),
        ]);

        if (isMounted && keysRes) {
          const keysJson = await keysRes.json().catch(() => null);
          if (keysJson?.success && Array.isArray(keysJson.data)) {
            setAvailableKeys(keysJson.data);
          }
        }

        if (isMounted && templatesRes) {
          const templatesJson = await templatesRes.json().catch(() => null);
          if (templatesJson?.success && templatesJson.data && Array.isArray(templatesJson.data.templates)) {
            const mapped: TemplateOption[] = templatesJson.data.templates.map((t: any) => {
              const bodyComp = t.components?.find((c: any) => c.type?.toUpperCase() === "BODY");
              return {
                id: t.id || t.name,
                name: t.name,
                status: t.status || "APPROVED",
                category: t.category || "UTILITY",
                language: t.language || "en_US",
                bodySnippet: bodyComp?.text || undefined,
                components: t.components || [],
              };
            });
            if (!mapped.some((t) => t.name.toLowerCase() === "hello_world")) {
              mapped.unshift(DEFAULT_HELLO_WORLD);
            }
            setAvailableTemplates(mapped);

            const initialTpl =
              mapped.find(
                (t) => t.name.toLowerCase() === (form.getFieldValue("templateName") || "hello_world").toLowerCase()
              ) || mapped[0];
            if (initialTpl) {
              syncTemplateVariables(initialTpl);
            }
          }
        }
      } catch {
        // Fallback to defaults
      } finally {
        if (isMounted) {
          setIsLoadingKeys(false);
          setIsLoadingTemplates(false);
        }
      }
    };
    loadInitialData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefreshTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const res = await fetch("/api/v1/meta/templates");
      const json = await res.json();
      if (json?.success && json.data && Array.isArray(json.data.templates)) {
        const mapped: TemplateOption[] = json.data.templates.map((t: any) => {
          const bodyComp = t.components?.find((c: any) => c.type?.toUpperCase() === "BODY");
          return {
            id: t.id || t.name,
            name: t.name,
            status: t.status || "APPROVED",
            category: t.category || "UTILITY",
            language: t.language || "en_US",
            bodySnippet: bodyComp?.text || undefined,
            components: t.components || [],
          };
        });
        if (!mapped.some((t) => t.name.toLowerCase() === "hello_world")) {
          mapped.unshift(DEFAULT_HELLO_WORLD);
        }
        setAvailableTemplates(mapped);
        const currentName = form.getFieldValue("templateName") || "hello_world";
        const currentTpl = mapped.find((t) => t.name.toLowerCase() === currentName.toLowerCase()) || mapped[0];
        syncTemplateVariables(currentTpl);
        message.success(`Refreshed ${mapped.length} templates from Meta`);
      } else {
        message.info("No remote templates returned; using standard templates");
      }
    } catch {
      message.error("Failed to load templates from Meta API");
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const handleSelectTemplate = (templateName: string) => {
    const chosen = availableTemplates.find((t) => t.name === templateName);
    const nextLang = chosen?.language || form.getFieldValue("templateLanguage") || "en_US";
    form.setFieldsValue({
      templateName,
      templateLanguage: nextLang,
    });
    setWatchedValues((prev: any) => ({
      ...prev,
      templateName,
      templateLanguage: nextLang,
    }));
    syncTemplateVariables(chosen);
  };

  const activeTemplate = availableTemplates.find(
    (t) => t.name.toLowerCase() === (watchedValues.templateName || "").toLowerCase()
  );

  const activeBodyComp = activeTemplate?.components?.find((c: any) => c.type?.toUpperCase() === "BODY");
  const activeBodyText = activeBodyComp?.text || activeTemplate?.bodySnippet || "";
  const bodyPlaceholderKeys = extractPlaceholders(activeBodyText);

  const activeHeaderComp = activeTemplate?.components?.find((c: any) => c.type?.toUpperCase() === "HEADER");
  const headerFormat = activeHeaderComp?.format?.toUpperCase() || (activeHeaderComp?.text ? "TEXT" : undefined);
  const headerPlaceholderKeys = headerFormat === "TEXT" ? extractPlaceholders(activeHeaderComp?.text || "") : [];

  const handleValuesChange = (_: any, allValues: any) => {
    setWatchedValues({ ...watchedValues, ...allValues });
    if (allValues.type && allValues.type !== messageType) {
      setMessageType(allValues.type);
    }
    if (allValues.authMode && allValues.authMode !== authMode) {
      setAuthMode(allValues.authMode);
    }
  };

  const regenerateIdempotencyKey = () => {
    const newKey = `demo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    form.setFieldsValue({ idempotencyKey: newKey });
    setWatchedValues((prev: any) => ({ ...prev, idempotencyKey: newKey }));
  };

  const loadPreset = (preset: "template" | "text") => {
    if (preset === "template") {
      const defaultTemplate = availableTemplates[0]?.name || "hello_world";
      const defaultLang = availableTemplates[0]?.language || "en_US";
      form.setFieldsValue({
        type: "template",
        templateName: defaultTemplate,
        templateLanguage: defaultLang,
      });
      setMessageType("template");
      setIsCustomTemplate(false);
      setWatchedValues((prev: any) => ({
        ...prev,
        type: "template",
        templateName: defaultTemplate,
        templateLanguage: defaultLang,
      }));
      syncTemplateVariables(availableTemplates[0]);
      message.info(`Loaded Meta '${defaultTemplate}' template preset`);
    } else {
      form.setFieldsValue({
        type: "text",
        textBody: "Hello from WhatsApp Engine live dispatcher!",
      });
      setMessageType("text");
      setWatchedValues((prev: any) => ({
        ...prev,
        type: "text",
        textBody: "Hello from WhatsApp Engine live dispatcher!",
      }));
      message.info("Loaded standard text message preset");
    }
  };

  // Build the live request payload
  const buildPayload = () => {
    const to = watchedValues.to;
    const payload: any = { to, type: watchedValues.type || "template" };

    if (payload.type === "template") {
      const templateName = watchedValues.templateName || "hello_world";
      const templateLanguage = watchedValues.templateLanguage || "en_US";

      const activeTpl = availableTemplates.find(
        (t) => t.name.toLowerCase() === templateName.toLowerCase()
      );

      const components: any[] = [];

      // Header component
      const hComp = activeTpl?.components?.find((c: any) => c.type?.toUpperCase() === "HEADER");
      const hFormat = hComp?.format?.toUpperCase() || (hComp?.text ? "TEXT" : undefined);
      const hKeys = hFormat === "TEXT" ? extractPlaceholders(hComp?.text || "") : [];
      if (hKeys.length > 0) {
        components.push({
          type: "header",
          parameters: hKeys.map((k) => ({
            type: "text",
            text: headerVariables[k] || `Header_${k}`,
          })),
        });
      }

      // Body component
      const bComp = activeTpl?.components?.find((c: any) => c.type?.toUpperCase() === "BODY");
      const bKeys = extractPlaceholders(bComp?.text || activeTpl?.bodySnippet || "");
      if (bKeys.length > 0) {
        components.push({
          type: "body",
          parameters: bKeys.map((k) => ({
            type: "text",
            text: bodyVariables[k] || `Value_${k}`,
          })),
        });
      }

      payload.template = {
        name: templateName,
        language: templateLanguage,
        ...(components.length > 0 ? { components } : {}),
      };
    } else {
      payload.text = watchedValues.textBody || "Hello from WhatsApp Engine!";
    }

    if (watchedValues.idempotencyKey) {
      payload.idempotencyKey = watchedValues.idempotencyKey;
    }

    return payload;
  };

  const payloadJson = JSON.stringify(buildPayload(), null, 2);

  // Render text with live highlighted variables
  const renderHighlightedSnippet = (text: string, vars: Record<string, string>) => {
    if (!text) return null;
    const parts = text.split(/(\{\{(?:\d+|[a-zA-Z0-9_]+)\}\})/g);
    return (
      <span>
        {parts.map((part, i) => {
          const match = part.match(/^\{\{(\d+|[a-zA-Z0-9_]+)\}\}$/);
          if (match) {
            const key = match[1];
            const val = vars[key];
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  background: val ? "rgba(15, 157, 122, 0.18)" : "rgba(234, 88, 12, 0.18)",
                  color: val ? "#0f9d7a" : "#ea580c",
                  border: val ? "1px solid rgba(15, 157, 122, 0.35)" : "1px dashed rgba(234, 88, 12, 0.45)",
                  padding: "0 6px",
                  borderRadius: 4,
                  fontWeight: 600,
                  fontSize: "0.95em",
                  margin: "0 2px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
                title={`Placeholder {{${key}}}`}
              >
                {val || `{{${key}}}`}
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  };

  // Generate real-time cURL snippet
  const generateCurl = () => {
    const endpoint = watchedValues.endpoint || "/v1/api/message";
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const authHeader =
      watchedValues.authMode === "custom" && watchedValues.customApiKey
        ? `  -H "Authorization: Bearer ${watchedValues.customApiKey.trim()}" \\\n`
        : `  -H "Authorization: Bearer YOUR_API_KEY" \\\n`;

    return `curl -X POST "${origin}${endpoint}" \\\n${authHeader}  -H "Content-Type: application/json" \\\n  -d '${payloadJson.replace(/'/g, "'\\''")}'`;
  };

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(generateCurl());
    setCopiedCode(true);
    message.success("cURL command copied to clipboard!");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSendMessage = async (values: any) => {
    setIsSending(true);
    const start = performance.now();
    const endpoint = values.endpoint || "/v1/api/message";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (values.authMode === "custom" && values.customApiKey) {
      headers["Authorization"] = `Bearer ${values.customApiKey.trim()}`;
    }

    const payload = buildPayload();

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const durationMs = Math.round(performance.now() - start);
      let data: any;

      try {
        data = await res.json();
      } catch {
        data = { error: "Non-JSON response received from server." };
      }

      setLastResponse({
        status: res.status,
        statusText: res.statusText || (res.ok ? "OK" : "Error"),
        durationMs,
        headers: {
          "content-type": res.headers.get("content-type") || "application/json",
        },
        data,
        timestamp: new Date().toLocaleTimeString(),
      });

      if (res.ok) {
        message.success(`Message sent successfully! (Meta ID: ${data.messageId || "Dispatched"})`);
      } else {
        message.error(`Dispatch error (${res.status}): ${data.message || data.error || "Failed"}`);
      }
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      setLastResponse({
        status: 0,
        statusText: "Network Error",
        durationMs,
        headers: {},
        data: { error: err.message || "Failed to connect to the WhatsApp Engine server." },
        timestamp: new Date().toLocaleTimeString(),
      });
      message.error("Network error sending message.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <h2 className={styles.title}>
            <Send size={22} color="var(--brand)" />
            <span>WhatsApp Message API Demo</span>
          </h2>
          <p className={styles.subtitle}>
            Interactive testing sandbox for hitting the WhatsApp Cloud API dispatch endpoint (
            <code style={{ background: "rgba(15,157,122,0.1)", padding: "2px 6px", borderRadius: 4 }}>
              POST /v1/api/message
            </code>
            )
          </p>
        </div>

        <div className={styles.endpointBadge}>
          <span className={styles.methodPost}>POST</span>
          <span>/v1/api/message</span>
        </div>
      </div>

      {/* Main Two-Column Grid */}
      <div className={styles.grid}>
        {/* Left Column: Form Builder */}
        <div className={`glass ${styles.card}`}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <Terminal size={17} color="var(--brand)" />
              <span>Request Configuration</span>
            </div>
            <div className={styles.presetBar}>
              <Button size="small" onClick={() => loadPreset("template")}>
                Template Preset
              </Button>
              <Button size="small" onClick={() => loadPreset("text")}>
                Text Preset
              </Button>
            </div>
          </div>

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSendMessage}
            onValuesChange={handleValuesChange}
            initialValues={{
              endpoint: "/v1/api/message",
              authMode: "session",
              to: "+15551234567",
              type: "template",
              templateName: "hello_world",
              templateLanguage: "en_US",
              textBody: "Hello from WhatsApp Engine live demo!",
              idempotencyKey: watchedValues.idempotencyKey,
            }}
          >
            {/* Target Endpoint */}
            <Form.Item
              name="endpoint"
              label="Target API Route"
              extra="Both route aliases hit the identical underlying message delivery pipeline"
            >
              <Radio.Group buttonStyle="solid" size="small">
                <Radio.Button value="/v1/api/message">/v1/api/message (Standard Alias)</Radio.Button>
                <Radio.Button value="/api/v1/messages">/api/v1/messages (Direct)</Radio.Button>
              </Radio.Group>
            </Form.Item>

            {/* Authentication Mode */}
            <div style={{ padding: "12px", background: "var(--glass)", borderRadius: 12, border: "1px solid var(--stroke)", marginBottom: 16 }}>
              <Form.Item
                name="authMode"
                label={
                  <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    <KeyRound size={14} color="var(--brand)" />
                    <span>Authentication Method</span>
                  </span>
                }
                style={{ marginBottom: 8 }}
              >
                <Radio.Group>
                  <Radio value="session">
                    <span>Dashboard Session (Logged-In User)</span>
                  </Radio>
                  <Radio value="custom">
                    <span>API Key (Bearer Token)</span>
                  </Radio>
                </Radio.Group>
              </Form.Item>

              {authMode === "custom" && (
                <div style={{ marginTop: 8 }}>
                  <Form.Item
                    name="customApiKey"
                    label="WhatsApp Engine API Key"
                    rules={[{ required: true, message: "Please provide an API key." }]}
                    extra={
                      <span>
                        Enter a key with <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 4 }}>messages:send</code> scope.{" "}
                        <Link href="/api-keys" style={{ color: "var(--brand)" }}>
                          Manage API Keys <ExternalLink size={11} style={{ display: "inline" }} />
                        </Link>
                      </span>
                    }
                  >
                    <Input.Password
                      placeholder="wae_live_..."
                      style={{ fontFamily: "monospace" }}
                    />
                  </Form.Item>

                  {availableKeys.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -4 }}>
                      <span>Quick select active key: </span>
                      {availableKeys.slice(0, 3).map((k) => (
                        <Tag
                          key={k.id}
                          style={{ cursor: "pointer", fontFamily: "monospace" }}
                          onClick={() => {
                            form.setFieldsValue({ customApiKey: k.keyPrefix });
                            setWatchedValues((prev: any) => ({ ...prev, customApiKey: k.keyPrefix }));
                          }}
                        >
                          {k.name} ({k.keyPrefix.slice(0, 10)}...)
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Recipient Phone */}
            <Form.Item
              name="to"
              label="Recipient Phone Number ('to')"
              rules={[
                { required: true, message: "Recipient number is required." },
                {
                  pattern: /^\+[1-9]\d{7,14}$/,
                  message: "Must be a valid international E.164 phone number (e.g. +15551234567 or +919014683627)",
                },
              ]}
              extra="Format: +[Country Code][Subscriber Digits] without spaces or dashes"
            >
              <Input
                placeholder=''
                style={{ fontFamily: "monospace", fontSize: 14 }}
              />
            </Form.Item>

            {/* Message Type Selector */}
            <Form.Item
              name="type"
              label="Message Type"
              style={{ marginBottom: 12 }}
            >
              <Radio.Group style={{ width: "100%" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Radio.Button value="template" style={{ textAlign: "center", height: 42, lineHeight: "40px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <FileText size={15} />
                      <span>Template Message</span>
                    </div>
                  </Radio.Button>
                  <Radio.Button value="text" style={{ textAlign: "center", height: 42, lineHeight: "40px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <MessageSquare size={15} />
                      <span>Free-Form Text</span>
                    </div>
                  </Radio.Button>
                </div>
              </Radio.Group>
            </Form.Item>

            {/* Conditional Type Fields */}
            {messageType === "template" ? (
              <div style={{ padding: "14px", background: "var(--glass)", borderRadius: 12, border: "1px solid var(--stroke)", marginBottom: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                  <Form.Item
                    name="templateName"
                    label={
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 8 }}>
                        <span>Meta Template</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Button
                            type="link"
                            size="small"
                            onClick={() => setIsCustomTemplate(!isCustomTemplate)}
                            style={{ padding: 0, height: "auto", fontSize: 11 }}
                          >
                            {isCustomTemplate ? "Select from list" : "Enter custom"}
                          </Button>
                          <Tooltip title="Refresh live templates from Meta">
                            <Button
                              type="text"
                              size="small"
                              icon={<RefreshCw size={11} className={isLoadingTemplates ? styles.spinIcon : undefined} />}
                              onClick={handleRefreshTemplates}
                              style={{ padding: "0 4px", height: "auto" }}
                            />
                          </Tooltip>
                        </div>
                      </div>
                    }
                    rules={[{ required: true, message: "Template name is required." }]}
                    extra={isCustomTemplate ? "Type exact Meta template name" : `${availableTemplates.length} templates available`}
                  >
                    {isCustomTemplate ? (
                      <Input
                        placeholder="e.g. hello_world or custom_template"
                        style={{ fontFamily: "monospace" }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setWatchedValues((prev: any) => ({ ...prev, templateName: val }));
                        }}
                      />
                    ) : (
                      <Select
                        showSearch
                        placeholder="Select an approved template"
                        loading={isLoadingTemplates}
                        style={{ fontFamily: "monospace" }}
                        onChange={handleSelectTemplate}
                        filterOption={(input, option) =>
                          (option?.value as string)?.toLowerCase().includes(input.toLowerCase())
                        }
                        options={availableTemplates.map((t) => ({
                          value: t.name,
                          label: (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                              <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{t.name}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <Tag
                                  color={
                                    t.status === "APPROVED"
                                      ? "success"
                                      : t.status === "PENDING"
                                      ? "warning"
                                      : t.status === "REJECTED"
                                      ? "error"
                                      : "default"
                                  }
                                  style={{ fontSize: 10, margin: 0, padding: "0 4px", lineHeight: "16px" }}
                                >
                                  {t.status}
                                </Tag>
                                <Tag style={{ fontSize: 10, margin: 0, padding: "0 4px", lineHeight: "16px" }}>
                                  {t.category}
                                </Tag>
                              </div>
                            </div>
                          ),
                          key: t.id,
                        }))}
                      />
                    )}
                  </Form.Item>

                  <Form.Item
                    name="templateLanguage"
                    label="Language"
                    rules={[{ required: true }]}
                    extra="ISO code"
                  >
                    <Select
                      showSearch
                      options={[
                        { value: "en_US", label: "en_US" },
                        { value: "en_GB", label: "en_GB" },
                        { value: "es_ES", label: "es_ES" },
                        { value: "hi_IN", label: "hi_IN" },
                        { value: "pt_BR", label: "pt_BR" },
                        { value: "fr_FR", label: "fr_FR" },
                        { value: "de_DE", label: "de_DE" },
                        { value: "ar", label: "ar" },
                        { value: "id_ID", label: "id_ID" },
                      ]}
                      onChange={(val) => {
                        setWatchedValues((prev: any) => ({ ...prev, templateLanguage: val }));
                      }}
                    />
                  </Form.Item>
                </div>

                {/* Selected Template Details Preview */}
                {activeTemplate && (
                  <div
                    style={{
                      marginTop: 6,
                      marginBottom: 12,
                      padding: "12px 14px",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid var(--stroke)",
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: activeTemplate.bodySnippet ? 6 : 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                        <FileText size={13} color="var(--brand)" />
                        <span>Template: {activeTemplate.name}</span>
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Tag
                          color={activeTemplate.status === "APPROVED" ? "success" : activeTemplate.status === "PENDING" ? "warning" : "error"}
                          style={{ margin: 0, fontSize: 11 }}
                        >
                          {activeTemplate.status}
                        </Tag>
                        <Tag style={{ margin: 0, fontSize: 11 }}>{activeTemplate.category}</Tag>
                        <Tag style={{ margin: 0, fontSize: 11 }}>{activeTemplate.language}</Tag>
                      </div>
                    </div>

                    {/* Header preview if available */}
                    {activeHeaderComp && activeHeaderComp.text && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                        Header: &ldquo;{renderHighlightedSnippet(activeHeaderComp.text, headerVariables)}&rdquo;
                      </div>
                    )}

                    {activeBodyText && (
                      <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", lineHeight: 1.5, marginTop: 4 }}>
                        &ldquo;{renderHighlightedSnippet(activeBodyText, bodyVariables)}&rdquo;
                      </div>
                    )}

                    {activeTemplate.status !== "APPROVED" && (
                      <Alert
                        type="warning"
                        showIcon
                        style={{ marginTop: 8, fontSize: 12 }}
                        message={`Status is '${activeTemplate.status}'. Meta Cloud API will reject messages until approved.`}
                      />
                    )}
                  </div>
                )}

                {/* Template Variables / Placeholders Input Card */}
                {(bodyPlaceholderKeys.length > 0 || headerPlaceholderKeys.length > 0) && (
                  <div
                    style={{
                      marginTop: 10,
                      marginBottom: 14,
                      padding: "14px 16px",
                      background: "rgba(15, 157, 122, 0.05)",
                      border: "1px solid rgba(15, 157, 122, 0.25)",
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                        <Sparkles size={14} color="var(--brand)" />
                        <span>Template Variables / Placeholders ({bodyPlaceholderKeys.length + headerPlaceholderKeys.length})</span>
                      </span>
                      <Tag color="processing" style={{ margin: 0, fontSize: 10 }}>
                        Required by Meta
                      </Tag>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 12px 0", lineHeight: 1.4 }}>
                      This template contains dynamic placeholders. Fill in each field below to replace <code>&#123;&#123;1&#125;&#125;</code>, <code>&#123;&#123;2&#125;&#125;</code>, etc. in the dispatched message:
                    </p>

                    {headerPlaceholderKeys.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.5 }}>
                          Header Placeholders
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: headerPlaceholderKeys.length > 1 ? "1fr 1fr" : "1fr", gap: 10 }}>
                          {headerPlaceholderKeys.map((key) => (
                            <div key={`h_${key}`}>
                              <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4, color: "var(--text)" }}>
                                Header Placeholder <code style={{ color: "var(--brand)" }}>&#123;&#123;{key}&#125;&#125;</code>
                              </label>
                              <Input
                                value={headerVariables[key] ?? ""}
                                placeholder={`Header value for {{${key}}}`}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setHeaderVariables((prev) => ({ ...prev, [key]: val }));
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {bodyPlaceholderKeys.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.5 }}>
                          Body Placeholders
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: bodyPlaceholderKeys.length > 1 ? "1fr 1fr" : "1fr", gap: 10 }}>
                          {bodyPlaceholderKeys.map((key, idx) => (
                            <div key={`b_${key}`}>
                              <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4, color: "var(--text)" }}>
                                Placeholder <code style={{ color: "var(--brand)" }}>&#123;&#123;{key}&#125;&#125;</code>
                              </label>
                              <Input
                                value={bodyVariables[key] ?? ""}
                                placeholder={getPlaceholderSuggestion(key, idx, activeTemplate?.name || "")}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setBodyVariables((prev) => ({ ...prev, [key]: val }));
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
                  <ShieldCheck size={14} color="#16A34A" />
                  <span>Meta template messages bypass the 24-hour customer window and can be sent anytime.</span>
                </div>
              </div>
            ) : (
              <div style={{ padding: "14px", background: "var(--glass)", borderRadius: 12, border: "1px solid var(--stroke)", marginBottom: 16 }}>
                <Form.Item
                  name="textBody"
                  label="Message Body ('text')"
                  rules={[{ required: true, message: "Message text is required." }]}
                  extra="Plain text message content"
                >
                  <Input.TextArea rows={3} placeholder="Type your WhatsApp message..." />
                </Form.Item>

                <div style={{ fontSize: 12, color: "#D97706", display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    WhatsApp policy requires the customer to have sent an inbound message within the last 24 hours. If not, Meta returns a 422 error.
                  </span>
                </div>
              </div>
            )}

            {/* Idempotency Key */}
            <Form.Item
              name="idempotencyKey"
              label="Idempotency Key (Optional)"
              extra="Prevents duplicate message dispatch if requests are retried"
            >
              <div style={{ display: "flex", gap: 8 }}>
                <Input placeholder="demo_123456" style={{ fontFamily: "monospace" }} />
                <Button icon={<RefreshCw size={14} />} onClick={regenerateIdempotencyKey} title="Regenerate Key">
                  New Key
                </Button>
              </div>
            </Form.Item>

            {/* Submit Action */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 16 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={isSending}
                icon={<Send size={15} />}
                size="large"
                style={{ backgroundColor: "var(--brand)", minWidth: 200 }}
              >
                Send via WhatsApp
              </Button>
            </div>
          </Form>
        </div>

        {/* Right Column: Live cURL & Response Inspector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Live cURL Preview Card */}
          <div className={`glass ${styles.card}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>
                <Code2 size={16} color="var(--brand)" />
                <span>Live Request Inspector (cURL)</span>
              </div>
              <Button
                size="small"
                icon={copiedCode ? <Check size={13} color="#16A34A" /> : <Copy size={13} />}
                onClick={handleCopyCurl}
              >
                {copiedCode ? "Copied" : "Copy cURL"}
              </Button>
            </div>

            <div className={styles.codeBlock}>{generateCurl()}</div>
          </div>

          {/* Response Inspector Card */}
          <div className={`glass ${styles.card}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>
                <Clock size={16} color="var(--brand)" />
                <span>Response Inspector</span>
              </div>
              {lastResponse && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Tag
                    color={
                      lastResponse.status === 200
                        ? "success"
                        : lastResponse.status === 422
                        ? "warning"
                        : "error"
                    }
                    style={{ fontWeight: 600, fontSize: 12, margin: 0 }}
                  >
                    {lastResponse.status} {lastResponse.statusText}
                  </Tag>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>
                    {lastResponse.durationMs}ms
                  </span>
                </div>
              )}
            </div>

            {isSending ? (
              <div style={{ textAlign: "center", padding: "40px 16px" }}>
                <Spin tip="Connecting to WhatsApp Cloud API via Engine..." />
              </div>
            ) : lastResponse ? (
              <div className={styles.responseWindow}>
                {/* Status Guidance Alert */}
                {lastResponse.status === 200 ? (
                  <Alert
                    type="success"
                    showIcon
                    message="Message Accepted by Meta Graph API"
                    description={
                      <div style={{ fontSize: 12 }}>
                        Meta WAMID:{" "}
                        <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 4 }}>
                          {lastResponse.data?.messageId}
                        </code>
                        . Inbound webhook delivery receipts will track delivery and read states.
                      </div>
                    }
                  />
                ) : lastResponse.status === 422 ? (
                  <Alert
                    type="warning"
                    showIcon
                    message="24-Hour Customer Window Expired"
                    description="WhatsApp requires pre-approved templates to initiate conversations outside the 24-hour window. Switch to 'Template Message' and try again."
                  />
                ) : lastResponse.status === 401 ? (
                  <Alert
                    type="error"
                    showIcon
                    message="Unauthorized (401)"
                    description="API key is missing, expired, or invalid. Switch to Dashboard Session auth or provide an active API key with 'messages:send' scope."
                  />
                ) : (
                  <Alert
                    type="error"
                    showIcon
                    message={`Error: ${lastResponse.statusText}`}
                    description={lastResponse.data?.message || lastResponse.data?.error || "Request failed."}
                  />
                )}

                {/* Response JSON */}
                <div className={styles.codeBlock}>
                  {JSON.stringify(lastResponse.data, null, 2)}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)", fontSize: 13 }}>
                <Send size={28} style={{ opacity: 0.3, margin: "0 auto 10px" }} />
                <p style={{ fontWeight: 600, color: "var(--text)" }}>Ready to Dispatch</p>
                <p>Fill out the form on the left and click <strong>Send via WhatsApp</strong> to trigger the live endpoint and view the response here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
