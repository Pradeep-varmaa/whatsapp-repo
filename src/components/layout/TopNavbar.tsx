"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Input, Dropdown, MenuProps, Tooltip, Modal, Form, Button, message } from "antd";
import {
  Search,
  ChevronDown,
  Menu,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Smartphone,
  FolderGit2,
  Plus,
  ShieldCheck,
  Check,
} from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import styles from "./TopNavbar.module.css";

interface TopNavbarProps {
  onToggleMobile?: () => void;
  onToggleCollapse?: () => void;
  sidebarCollapsed?: boolean;
}

interface WhatsAppAccountItem {
  wabaId: string;
  accountName: string;
  healthStatus?: string;
  phoneNumbersCount?: number;
}

interface ProjectItem {
  projectId: string;
  name: string;
  slug: string;
  phoneNumbersCount?: number;
}

export function TopNavbar({
  onToggleMobile,
  onToggleCollapse,
  sidebarCollapsed = false,
}: TopNavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();

  const [currentUser, setCurrentUser] = useState<{ fullName: string; role: string; email: string } | null>(null);
  const [accounts, setAccounts] = useState<WhatsAppAccountItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [activeWabaId, setActiveWabaId] = useState<string>("");
  const [activeProjectId, setActiveProjectId] = useState<string>("");

  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [submittingAccount, setSubmittingAccount] = useState(false);
  const [submittingProject, setSubmittingProject] = useState(false);

  const [accountForm] = Form.useForm();
  const [projectForm] = Form.useForm();

  const loadUserData = () => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          const data = json.data;
          setCurrentUser({
            fullName: data.email.split("@")[0].toUpperCase(),
            role: (data.role || "user").toUpperCase(),
            email: data.email,
          });
          setAccounts(data.accounts || []);
          setProjects(data.projects || []);
          setActiveWabaId(data.activeWabaId || "");
          setActiveProjectId(data.activeProjectId || "");
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadUserData();
  }, []);

  const handleSwitchContext = async (newWabaId: string, newProjectId?: string) => {
    try {
      const res = await fetch("/api/auth/switch-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wabaId: newWabaId, projectId: newProjectId }),
      });
      const json = await res.json();
      if (json.success) {
        message.success("Account context switched");
        setActiveWabaId(newWabaId);
        if (json.data?.activeProjectId) {
          setActiveProjectId(json.data.activeProjectId);
        }
        if (json.data?.availableProjects) {
          setProjects(json.data.availableProjects);
        }
        // Refresh router / components to display project-scoped data
        router.refresh();
        window.location.reload();
      } else {
        message.error(json.error?.message || "Failed to switch context");
      }
    } catch {
      message.error("Failed to communicate with authentication service");
    }
  };

  const handleAddAccountSubmit = async (values: any) => {
    setSubmittingAccount(true);
    try {
      const res = await fetch("/api/v1/waba-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (json.success) {
        message.success("WhatsApp Account securely connected");
        setIsAddAccountOpen(false);
        accountForm.resetFields();
        loadUserData();
        if (json.data?.account?.wabaId) {
          handleSwitchContext(json.data.account.wabaId, json.data.defaultProject?.projectId);
        }
      } else {
        message.error(json.error?.message || "Failed to connect WhatsApp account");
      }
    } catch {
      message.error("Network error while connecting account");
    } finally {
      setSubmittingAccount(false);
    }
  };

  const handleCreateProjectSubmit = async (values: any) => {
    if (!activeWabaId) {
      message.error("Please select a WhatsApp account first");
      return;
    }
    setSubmittingProject(true);
    try {
      const res = await fetch(`/api/v1/waba-accounts/${activeWabaId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (json.success) {
        message.success("Project created successfully");
        setIsCreateProjectOpen(false);
        projectForm.resetFields();
        if (json.data?.projectId) {
          handleSwitchContext(activeWabaId, json.data.projectId);
        }
      } else {
        message.error(json.error?.message || "Failed to create project");
      }
    } catch {
      message.error("Network error while creating project");
    } finally {
      setSubmittingProject(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const getPageInfo = () => {
    const segment = pathname.split("/").filter(Boolean)[0] || "overview";
    if (segment === "workflows") return { segment, title: "Agent Management" };
    if (segment === "workflow") return { segment, title: "Workflow" };
    const title = segment
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    return { segment, title };
  };

  const { title } = getPageInfo();

  const currentWaba = accounts.find((a) => a.wabaId === activeWabaId) || accounts[0];
  const currentProject = projects.find((p) => p.projectId === activeProjectId) || projects[0];

  // Dropdown items for Apps under this WhatsApp Developer Account
  const appMenuItems: MenuProps["items"] = [
    {
      key: "header",
      label: <span style={{ fontWeight: 600, fontSize: 11, color: "var(--muted)" }}>APPS IN THIS DEVELOPER ACCOUNT</span>,
      disabled: true,
    },
    ...projects.map((p) => ({
      key: p.projectId,
      label: (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minWidth: 200 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>ID: {p.slug || p.projectId}</div>
          </div>
          {p.projectId === activeProjectId && <Check size={14} style={{ color: "var(--brand)", marginLeft: 8 }} />}
        </div>
      ),
      onClick: () => handleSwitchContext(activeWabaId, p.projectId),
    })),
    { type: "divider" },
    {
      key: "create-app",
      label: (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--brand)", fontWeight: 500 }}>
          <Plus size={14} /> Connect / Create New App
        </div>
      ),
      onClick: () => setIsCreateProjectOpen(true),
    },
    {
      key: "manage-apps",
      label: (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text)", fontSize: 12 }}>
          <FolderGit2 size={13} /> Manage All Apps
        </div>
      ),
      onClick: () => router.push("/subscribed-apps"),
    },
  ];

  const userMenuItems: MenuProps["items"] = [
    { key: "profile", label: `Signed in as ${currentUser?.email || "User"}`, disabled: true },
    { type: "divider" },
    { key: "role", label: `Role: ${currentUser?.role || "USER"}` },
    { key: "api-keys", label: "API Configuration", onClick: () => { router.push("/api-keys"); } },
    { type: "divider" },
    { key: "logout", danger: true, label: "Log Out", onClick: handleLogout },
  ];

  return (
    <>
      <header className={`glass ${styles.header}`}>
        {/* Left: Mobile hamburger & Page Title */}
        <div className={styles.leftSection}>
          <button
            className={styles.mobileMenuButton}
            onClick={onToggleMobile}
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>
          {onToggleCollapse && (
            <button
              type="button"
              className={styles.desktopCollapseButton}
              onClick={onToggleCollapse}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          )}
          <div>
            <h1 className={styles.pageTitle}>{title}</h1>
          </div>
        </div>

        {/* Middle: WhatsApp Developer Account Context & App Switcher */}
        <div className={styles.contextSwitcher}>
          {/* Associated WhatsApp Developer Account */}
          <div className={styles.devAccountBadge} title={`WhatsApp Developer Account (WABA ID: ${currentWaba?.wabaId || 'Default'})`}>
            <ShieldCheck size={15} className={styles.selectorIcon} />
            <div className={styles.selectorLabel}>
              <span className={styles.selectorSub}>WhatsApp Dev Account</span>
              <span style={{ fontWeight: 600 }}>{currentWaba?.accountName || "Developer Portal"}</span>
            </div>
          </div>

          <span className={styles.selectorDivider}>/</span>

          {/* App Switcher */}
          <Dropdown menu={{ items: appMenuItems }} trigger={["click"]} placement="bottomLeft">
            <button type="button" className={styles.selectorButton} title="Switch WhatsApp App under this Account">
              <FolderGit2 size={15} className={styles.selectorIcon} />
              <div className={styles.selectorLabel}>
                <span className={styles.selectorSub}>WhatsApp App</span>
                <span style={{ fontWeight: 600 }}>{currentProject?.name || "All Apps"}</span>
              </div>
              <ChevronDown size={13} style={{ color: "var(--muted)", marginLeft: 4 }} />
            </button>
          </Dropdown>
        </div>

        {/* Right Controls */}
        <div className={styles.rightSection}>
          {/* Search */}
          <div className={styles.searchContainer}>
            <Input
              prefix={<Search size={15} style={{ color: "var(--muted)", marginRight: 6 }} />}
              placeholder="Search phone numbers, messages..."
              className="glass-input"
              style={{ fontSize: 13, padding: "7px 12px", borderRadius: 9999 }}
            />
          </div>

          {/* User Profile Chip */}
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={["click"]}>
            <div className={`${styles.userChip} glass`}>
              <div className={styles.avatar}>
                {currentUser?.fullName?.slice(0, 2) || "US"}
              </div>
              <div className={styles.userInfo}>
                <div className={styles.userName}>{currentUser?.fullName || "WhatsApp User"}</div>
                <div className={styles.userRole}>{currentUser?.role || "USER"}</div>
              </div>
              <ChevronDown size={14} className={styles.chevronIcon} />
            </div>
          </Dropdown>
        </div>
      </header>

      {/* Modal: Connect WhatsApp Account */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldCheck size={20} style={{ color: "var(--brand)" }} />
            <span>Connect WhatsApp Business Account</span>
          </div>
        }
        open={isAddAccountOpen}
        onCancel={() => setIsAddAccountOpen(false)}
        footer={null}
        destroyOnClose
      >
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>
          Your WhatsApp credentials are encrypted with AES-256-GCM at rest and never exposed to the client.
        </p>
        <Form form={accountForm} layout="vertical" onFinish={handleAddAccountSubmit}>
          <Form.Item
            name="accountName"
            label="Account Display Name"
            rules={[{ required: true, message: "Please enter an account name" }]}
          >
            <Input placeholder="e.g. Acme Support Central" />
          </Form.Item>

          <Form.Item
            name="wabaId"
            label="Meta WhatsApp Business Account ID (WABA ID)"
            rules={[{ required: true, message: "Please enter your Meta WABA ID" }]}
          >
            <Input placeholder="e.g. 102938475610293" />
          </Form.Item>

          <Form.Item
            name="accessToken"
            label="System User Access Token"
            rules={[{ required: true, message: "Please provide your Meta Access Token" }]}
            extra="Encrypted immediately upon receipt. Masked from all API responses."
          >
            <Input.Password placeholder="EAAG..." />
          </Form.Item>

          <Form.Item
            name="appSecret"
            label="Meta App Secret (Optional)"
            extra="Used for HMAC-SHA256 signature and appsecret_proof verification."
          >
            <Input.Password placeholder="Meta App Secret" />
          </Form.Item>

          <Form.Item name="webhookVerifyToken" label="Webhook Verify Token (Optional)">
            <Input placeholder="Custom verify token" />
          </Form.Item>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
            <Button onClick={() => setIsAddAccountOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submittingAccount}>
              Connect & Vault Account
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal: Create Project under Account */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FolderGit2 size={20} style={{ color: "var(--brand)" }} />
            <span>Create New Project in this Account</span>
          </div>
        }
        open={isCreateProjectOpen}
        onCancel={() => setIsCreateProjectOpen(false)}
        footer={null}
        destroyOnClose
      >
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>
          All messages, workflows, phone numbers, and webhooks in this project will belong exclusively to this WhatsApp Account.
        </p>
        <Form form={projectForm} layout="vertical" onFinish={handleCreateProjectSubmit}>
          <Form.Item
            name="name"
            label="Project Name"
            rules={[{ required: true, message: "Please enter a project name" }]}
          >
            <Input placeholder="e.g. Customer Care Bot" />
          </Form.Item>

          <Form.Item name="description" label="Description (Optional)">
            <Input.TextArea rows={3} placeholder="Describe the purpose of this project..." />
          </Form.Item>

          <Form.Item name="callbackUrl" label="Outbound Webhook Callback URL (Optional)">
            <Input placeholder="https://api.yourdomain.com/webhooks" />
          </Form.Item>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
            <Button onClick={() => setIsCreateProjectOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submittingProject}>
              Create Project
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
