import type { Metadata, Viewport } from "next";
import { Fredoka, Noto_Sans_SC } from "next/font/google";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const bodyFont = Noto_Sans_SC({
  variable: "--font-body",
  display: "swap",
  preload: false,
});

const displayFont = Fredoka({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "LearnSphere",
    template: "%s · LearnSphere",
  },
  description: "把技术文档变成可追问、可复习的 AI 测验。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{const s=JSON.parse(localStorage.getItem('learnsphere.settings.v1')||'{}');const t=s.theme==='dark'||s.theme==='light'?s.theme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch{}",
          }}
        />
      </head>
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
