"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";

const navigation = [
  { href: "/", label: "学习台" },
  { href: "/history", label: "练习记录" },
  { href: "/settings", label: "模型设置" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="LearnSphere 首页">
          <span className="brand__orbit" aria-hidden="true">
            <span />
          </span>
          <span>LearnSphere</span>
        </Link>
        <nav className="site-nav" aria-label="主要导航">
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} className="site-nav__link" data-active={active} href={item.href}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <ThemeToggle />
      </header>
      <main id="main-content" className="site-main">
        {children}
      </main>
      <footer className="site-footer">
        <p>读过不算，答出来才算。</p>
        <p>内容和学习记录保存在你的浏览器中。</p>
      </footer>
    </div>
  );
}
