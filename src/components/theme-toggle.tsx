"use client";

import { useTheme } from "@/components/theme-provider";

const labels = {
  system: "跟随系统",
  light: "亮色主题",
  dark: "深色主题",
} as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const nextTheme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={`当前为${labels[theme]}，切换为${labels[nextTheme]}`}
      title={labels[theme]}
      onClick={() => setTheme(nextTheme)}
    >
      <span aria-hidden="true" className="theme-toggle__mark">
        {theme === "dark" ? "◐" : theme === "light" ? "●" : "◒"}
      </span>
      <span className="theme-toggle__label">{labels[theme]}</span>
    </button>
  );
}
