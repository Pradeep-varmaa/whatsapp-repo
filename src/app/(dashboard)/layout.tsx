"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNavbar } from "@/components/layout/TopNavbar";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AntdConfigProvider } from "@/components/providers/AntdConfigProvider";
import styles from "./layout.module.css";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("wa_engine_sidebar_collapsed");
      if (saved === "true") {
        setCollapsed(true);
      }
    } catch {}
  }, []);

  const handleToggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("wa_engine_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  return (
    <ThemeProvider>
      <AntdConfigProvider>
        <div className={`${styles.container} ${collapsed ? styles.containerCollapsed : ""}`}>
          <Sidebar
            collapsed={collapsed}
            onToggleCollapse={handleToggleCollapse}
            mobileOpen={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
          />
          <div className={styles.mainWrapper}>
            <TopNavbar
              onToggleMobile={() => setMobileOpen(!mobileOpen)}
              onToggleCollapse={handleToggleCollapse}
              sidebarCollapsed={collapsed}
            />
            <main className={styles.contentArea}>
              {children}
            </main>
          </div>
        </div>
      </AntdConfigProvider>
    </ThemeProvider>
  );
}
