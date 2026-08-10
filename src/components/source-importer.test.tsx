import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SourceImporter } from "@/components/source-importer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const inspection = {
  originalUrl: "https://example.com/#/chapter-6",
  title: "第六章 框架开发实践",
  language: "zh-CN",
  adapter: "docsify",
  chapters: [
    {
      id: "chapter-6",
      title: "第六章 框架开发实践",
      url: "https://example.com/chapter-6.md",
      depth: 0,
      selected: true,
    },
    {
      id: "chapter-7",
      title: "第七章 构建智能体框架",
      url: "https://example.com/chapter-7.md",
      depth: 0,
      selected: false,
    },
  ],
  sections: [
    {
      id: "section-1",
      chapterId: "chapter-6",
      title: "AgentScope",
      locator: "6.3 AgentScope",
      text: "AgentScope 使用消息驱动架构，并强调工程化能力。",
    },
  ],
};

describe("SourceImporter", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ source: inspection }),
      }),
    );
  });

  it("automatically inspects an initial URL and selects its current chapter", async () => {
    render(<SourceImporter initialUrl={inspection.originalUrl} />);

    expect(await screen.findByRole("heading", { name: inspection.title })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /第六章 框架开发实践/ })).toBeChecked();
    expect(screen.getByText("找到 2 个可选章节 · 输出语言将跟随中文")).toBeInTheDocument();
  });
});
