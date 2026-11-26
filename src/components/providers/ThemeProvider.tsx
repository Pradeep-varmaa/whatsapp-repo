"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  isDark: false,
  toggleTheme: () => {},
  setTheme: () => {},
});

const THEME_STORAGE_KEY = "wac_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Constant Clean White / Light Theme locked
    setThemeState("light");
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.style.colorScheme = "light";
    try {
      localStorage.setItem(THEME_STORAGE_KEY, "light");
    } catch {}
    setMounted(true);
  }, []);

  const setTheme = (_newTheme: Theme) => {
    setThemeState("light");
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.style.colorScheme = "light";
  };

  const toggleTheme = () => {
    // Locked to light theme
    setThemeState("light");
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.style.colorScheme = "light";
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: "light",
        isDark: false,
        toggleTheme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
