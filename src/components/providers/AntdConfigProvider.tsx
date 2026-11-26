"use client";

import React from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { useTheme } from "./ThemeProvider";

export function AntdConfigProvider({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme();

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: "#0f9d7a",
          colorInfo: "#0f9d7a",
          colorSuccess: "#16A34A",
          colorWarning: "#D97706",
          colorError: "#DC2626",
          colorBgBase: isDark ? "#091420" : "#FFFFFF",
          colorBgContainer: isDark ? "#0e1e30" : "#FFFFFF",
          colorBgElevated: isDark ? "#13253b" : "#FFFFFF",
          colorTextBase: isDark ? "#f8fafc" : "#111827",
          colorTextSecondary: isDark ? "#94a3b8" : "#4B5563",
          colorBorder: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.1)",
          borderRadius: 10,
          wireframe: false,
        },
        components: {
          Button: {
            colorPrimary: "#0f9d7a",
            primaryColor: "#FFFFFF",
            fontWeight: 600,
          },
          Card: {
            colorBgContainer: isDark ? "rgba(14, 28, 44, 0.85)" : "#FFFFFF",
            colorBorderSecondary: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)",
          },
          Menu: {
            itemBg: "transparent",
            itemSelectedBg: isDark ? "rgba(15, 157, 122, 0.18)" : "rgba(15, 157, 122, 0.08)",
            itemSelectedColor: isDark ? "#25d366" : "#0f9d7a",
          },
          Table: {
            headerBg: isDark ? "rgba(14, 30, 48, 0.9)" : "#F9FAFB",
            headerColor: isDark ? "#94a3b8" : "#4B5563",
            rowHoverBg: isDark ? "rgba(15, 157, 122, 0.12)" : "rgba(15, 157, 122, 0.04)",
          },
          Modal: {
            contentBg: isDark ? "rgba(14, 28, 44, 0.95)" : "#FFFFFF",
            headerBg: "transparent",
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
