"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip } from "antd";
import {
  LayoutDashboard,
  PhoneCall,
  Webhook,
  KeyRound,
  FolderGit2,
  ChevronLeft,
  ChevronRight,
  Radio,
  X,
  BookOpen,
  AppWindow,
  Sun,
  Moon,
  ShieldAlert,
  ShieldCheck,
  FileText,
  Send,
  Workflow,
  Bot,
  MessageSquare,
  Megaphone,
  Activity,
} from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import styles from "./Sidebar.module.css";

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { key: "overview", label: "Overview", href: "/overview", icon: <LayoutDashboard size={19} /> },
  { key: "phone-numbers", label: "Phone Numbers", href: "/phone-numbers", icon: <PhoneCall size={19} /> },
  { key: "demo", label: "Message Demo", href: "/demo", icon: <Send size={19} /> },
  { key: "templates", label: "Templates", href: "/templates", icon: <FileText size={19} /> },
  { key: "workflows", label: "Agent Management", href: "/workflows", icon: <Bot size={19} /> },
  { key: "workflow", label: "Workflow", href: "/workflow", icon: <Workflow size={19} /> },
  { key: "subscribed-apps", label: "Subscribed Apps", href: "/subscribed-apps", icon: <AppWindow size={19} /> },
  { key: "webhooks", label: "Webhooks", href: "/webhooks", icon: <Webhook size={19} /> },
  { key: "webhook-allowlist", label: "Webhook Allowlist", href: "/webhook-allowlist", icon: <ShieldCheck size={19} /> },
  { key: "background-jobs", label: "Background Jobs", href: "/background-jobs", icon: <Activity size={19} /> },
  { key: "api-keys", label: "API Keys", href: "/api-keys", icon: <KeyRound size={19} /> },
  { key: "audit-logs", label: "Audit Logs", href: "/audit-logs", icon: <ShieldAlert size={19} /> },
  { key: "projects", label: "Projects", href: "/projects", icon: <FolderGit2 size={19} /> },
  { key: "setup-guide", label: "Setup Guide", href: "/setup-guide", icon: <BookOpen size={19} /> },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({
  collapsed: externalCollapsed,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = onToggleCollapse !== undefined ? (externalCollapsed ?? false) : internalCollapsed;
  const toggleCollapse = onToggleCollapse || (() => setInternalCollapsed(!internalCollapsed));
  const { isDark, toggleTheme } = useTheme();

  return (
    <>
      {mobileOpen && (
        <div className={styles.mobileBackdrop} onClick={onCloseMobile} />
      )}
      <aside
        className={`glass ${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""} ${
          mobileOpen ? styles.sidebarMobileOpen : ""
        }`}
      >
        {/* Brand Header without V1 badge or subtitle */}
        <div className={styles.brandHeader}>
          <Link
            href="/overview"
            className={styles.brandLink}
            onClick={() => {
              if (onCloseMobile) onCloseMobile();
            }}
          >
            <div className={styles.brandLogo}>
              <Radio size={20} />
            </div>
            {(!collapsed || mobileOpen) && (
              <div className={styles.brandText}>
                <span className={styles.brandTitle}>WA Engine</span>
              </div>
            )}
          </Link>
          {mobileOpen && (
            <button
              onClick={onCloseMobile}
              className={styles.closeMobileButton}
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Nav List */}
        <div className={styles.navList}>
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== "/overview" && pathname.startsWith(item.href));
            const linkClass = `${styles.navItem} ${isActive ? styles.navItemActive : ""} ${
              collapsed && !mobileOpen ? styles.navItemCollapsed : ""
            }`;

            const linkContent = (
              <Link
                href={item.href}
                className={linkClass}
                onClick={() => {
                  if (onCloseMobile) onCloseMobile();
                }}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {(!collapsed || mobileOpen) && <span className={styles.navLabel}>{item.label}</span>}
                {(!collapsed || mobileOpen) && isActive && <div className={styles.activeDot} />}
              </Link>
            );

            if (collapsed && !mobileOpen) {
              return (
                <Tooltip key={item.key} title={item.label} placement="right">
                  <div>{linkContent}</div>
                </Tooltip>
              );
            }
            return <div key={item.key}>{linkContent}</div>;
          })}
        </div>

        {/* Collapse Footer */}
        <div className={styles.footer} style={{ justifyContent: "center" }}>
          <button
            onClick={toggleCollapse}
            className={styles.collapseButton}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{ width: "100%", display: "flex", justifyContent: "center" }}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </aside>
    </>
  );
}
