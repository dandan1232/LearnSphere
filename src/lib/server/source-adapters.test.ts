import { describe, expect, it } from "vitest";

import {
  markdownToSections,
  parseDocsifySidebar,
  resolveDocsifyDocumentUrl,
} from "@/lib/server/source-adapters";

describe("Docsify source adapter", () => {
  it("maps the supplied hash route to its Markdown document", () => {
    const result = resolveDocsifyDocumentUrl(
      "https://hello-agents.datawhale.cc/#/./chapter6/%E7%AC%AC%E5%85%AD%E7%AB%A0%20%E6%A1%86%E6%9E%B6%E5%BC%80%E5%8F%91%E5%AE%9E%E8%B7%B5?id=_63",
    );

    expect(decodeURIComponent(result ?? "")).toBe(
      "https://hello-agents.datawhale.cc/chapter6/第六章 框架开发实践.md",
    );
  });

  it("discovers a nested chapter tree and selects the current chapter", () => {
    const chapters = parseDocsifySidebar(
      [
        "- [第一章 初识智能体](./chapter1/第一章 初识智能体)",
        "  - [1.1 基础概念](./chapter1/第一章 初识智能体?id=基础)",
        "- [第六章 框架开发实践](./chapter6/第六章 框架开发实践)",
        "- [站外资料](https://example.com/other)",
      ].join("\n"),
      new URL("https://hello-agents.datawhale.cc/"),
      "https://hello-agents.datawhale.cc/chapter6/%E7%AC%AC%E5%85%AD%E7%AB%A0%20%E6%A1%86%E6%9E%B6%E5%BC%80%E5%8F%91%E5%AE%9E%E8%B7%B5.md",
    );

    expect(chapters).toHaveLength(2);
    expect(chapters[0].depth).toBe(0);
    expect(chapters[1].selected).toBe(true);
  });
});

describe("Markdown section extraction", () => {
  it("retains headings as stable source locators", () => {
    const sections = markdownToSections(
      [
        "# 第六章 框架开发实践",
        "这里是章节介绍，包含足够长的说明文本，用于形成第一个可以出题的知识片段。",
        "## 6.3 AgentScope",
        "AgentScope 使用消息驱动架构，并强调工程化、可观测性以及分布式能力。",
      ].join("\n\n"),
      "chapter-6",
      "第六章",
    );

    expect(sections.map((section) => section.locator)).toEqual([
      "第六章 框架开发实践",
      "6.3 AgentScope",
    ]);
    expect(sections.every((section) => section.chapterId === "chapter-6")).toBe(true);
  });
});
