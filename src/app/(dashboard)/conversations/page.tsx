"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Input, Button, Tag, Empty, Spin, message, Badge } from "antd";
import { MessageSquare, Send, Clock, Search, RefreshCw, Check, CheckCheck, AlertCircle } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

interface ConversationSummary {
  customerId: string;
  customerPhone: string;
  phoneNumberId: string;
  projectId: string;
  lastMessage: string;
  lastDirection: "inbound" | "outbound";
  lastStatus: string;
  lastMessageAt: string;
  windowOpen: boolean;
  windowExpiresAt: string | null;
}

interface ChatMessage {
  message_id: string;
  wamid: string | null;
  direction: "inbound" | "outbound";
  message_type: string;
  content_text: string | null;
  template_name: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

function formatRemaining(expiresAt: string | null): string {
  if (!expiresAt) return "Window closed";
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "Window expired";
  const hours = Math.floor(diffMs / 3600_000);
  const mins = Math.floor((diffMs % 3600_000) / 60_000);
  return `${hours}h ${mins}m left`;
}

function StatusTick({ status }: { status: string }) {
  if (status === "read") return <CheckCheck size={14} color="#53bdeb" />;
  if (status === "delivered") return <CheckCheck size={14} color="#8696a0" />;
  if (status === "failed") return <AlertCircle size={14} color="#ff4d4f" />;
  return <Check size={14} color="#8696a0" />;
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [windowInfo, setWindowInfo] = useState<{ isOpen: boolean; expiresAt: string | null }>({
    isOpen: false,
    expiresAt: null,
  });
  const [search, setSearch] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      if (data.success) {
        setConversations(data.conversations || []);
        if (!selectedId && data.conversations?.length > 0) {
          setSelectedId(data.conversations[0].customerId);
        }
      }
    } catch {
      // silent poll
    } finally {
      setLoadingList(false);
    }
  }, [selectedId]);

  const loadThread = useCallback(async (customerId: string) => {
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/conversations?customerId=${encodeURIComponent(customerId)}`);
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages || []);
        setWindowInfo(data.window || { isOpen: false, expiresAt: null });
      }
    } catch {
      // silent
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
    const timer = setInterval(loadConversations, 5000);
    return () => clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    loadThread(selectedId);
    const timer = setInterval(() => loadThread(selectedId), 4000);
    return () => clearInterval(timer);
  }, [selectedId, loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const activeConv = conversations.find((c) => c.customerId === selectedId) || null;
  const filtered = conversations.filter(
    (c) =>
      c.customerPhone.toLowerCase().includes(search.toLowerCase()) ||
      c.lastMessage.toLowerCase().includes(search.toLowerCase())
  );

  const handleSend = async () => {
    if (!activeConv || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientPhone: activeConv.customerPhone,
          phoneNumberId: activeConv.phoneNumberId,
          projectId: activeConv.projectId,
          text: replyText.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyText("");
        await loadThread(activeConv.customerId);
        await loadConversations();
      } else {
        message.error(data.error || "Failed to send message");
      }
    } catch {
      message.error("Network error sending message");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ padding: 24, height: "calc(100vh - 80px)", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            <MessageSquare size={22} color="#25D366" />
            Live Conversations Inbox
          </h1>
          <p style={{ margin: "2px 0 0", opacity: 0.7, fontSize: 13 }}>
            Real-time 2-panel customer messaging with 24-hour customer care window tracking.
          </p>
        </div>
        <Button icon={<RefreshCw size={15} />} onClick={loadConversations}>
          Refresh
        </Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, flex: 1, minHeight: 0 }}>
        {/* Left Thread List */}
        <GlassCard style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
          <Input
            prefix={<Search size={14} />}
            placeholder="Search phone or message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {loadingList ? (
              <div style={{ padding: 32, textAlign: "center" }}><Spin /></div>
            ) : filtered.length === 0 ? (
              <Empty description="No conversations yet" />
            ) : (
              filtered.map((conv) => {
                const isSelected = conv.customerId === selectedId;
                return (
                  <div
                    key={conv.customerId}
                    onClick={() => setSelectedId(conv.customerId)}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      cursor: "pointer",
                      background: isSelected ? "rgba(37, 211, 102, 0.14)" : "rgba(255,255,255,0.03)",
                      border: isSelected ? "1px solid rgba(37, 211, 102, 0.45)" : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: 14 }}>{conv.customerPhone}</strong>
                      <Badge status={conv.windowOpen ? "success" : "default"} />
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {conv.lastDirection === "outbound" ? "You: " : ""}
                      {conv.lastMessage || "[Media/Template]"}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, opacity: 0.6 }}>
                      <span>{conv.windowOpen ? formatRemaining(conv.windowExpiresAt) : "24h closed"}</span>
                      <span>{new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </GlassCard>

        {/* Right Chat Workspace */}
        <GlassCard style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!activeConv ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Empty description="Select a conversation to view messages" />
            </div>
          ) : (
            <>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{activeConv.customerPhone}</div>
                  <div style={{ fontSize: 12, opacity: 0.65 }}>Project: {activeConv.projectId}</div>
                </div>
                <Tag color={windowInfo.isOpen ? "success" : "warning"} icon={<Clock size={12} />}>
                  {windowInfo.isOpen ? `24h Window Open (${formatRemaining(windowInfo.expiresAt)})` : "24h Window Closed (Template Recommended)"}
                </Tag>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                {loadingThread && messages.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 32 }}><Spin /></div>
                ) : (
                  messages.map((m) => {
                    const isOut = m.direction === "outbound";
                    return (
                      <div
                        key={m.message_id}
                        style={{
                          alignSelf: isOut ? "flex-end" : "flex-start",
                          maxWidth: "72%",
                          padding: "10px 14px",
                          borderRadius: 12,
                          background: isOut ? "rgba(7, 94, 84, 0.72)" : "rgba(32, 44, 51, 0.85)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>
                          {m.content_text || (m.template_name ? `[Template: ${m.template_name}]` : `[${m.message_type}]`)}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, marginTop: 4, fontSize: 11, opacity: 0.7 }}>
                          <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          {isOut && <StatusTick status={m.status} />}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <div style={{ padding: 14, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 10 }}>
                <Input
                  placeholder="Type a WhatsApp reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onPressEnter={handleSend}
                  disabled={sending}
                />
                <Button
                  type="primary"
                  icon={<Send size={15} />}
                  loading={sending}
                  onClick={handleSend}
                  style={{ background: "#25D366", borderColor: "#25D366", color: "#0B141A", fontWeight: 600 }}
                >
                  Send
                </Button>
              </div>
            </>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
