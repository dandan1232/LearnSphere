import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuizConfigurator } from "@/components/quiz-configurator";
import type { SourceDocument } from "@/lib/domain/models";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  getSource: vi.fn(),
  putQuiz: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/storage/database", () => ({
  getSource: mocks.getSource,
  putQuiz: mocks.putQuiz,
}));
vi.mock("@/lib/storage/settings", () => ({
  loadAppSettings: () => ({
    provider: { baseUrl: "https://api.example.com/v1", model: "study-model" },
  }),
  loadApiKey: () => "test-key",
}));

const source: SourceDocument = {
  schemaVersion: 1,
  id: "source-config",
  url: "https://example.com/guide",
  title: "测试文档",
  language: "zh-CN",
  adapter: "documentation",
  chapters: [{
    id: "chapter-1",
    title: "第一章",
    url: "https://example.com/guide/one",
    depth: 0,
    selected: true,
  }],
  sections: [{
    id: "section-1",
    chapterId: "chapter-1",
    title: "核心概念",
    locator: "第一章 / 核心概念",
    text: "用于生成题目的原文内容。",
  }],
  contentHash: "hash",
  importedAt: "2026-08-10T01:00:00.000Z",
};

describe("QuizConfigurator", () => {
  beforeEach(() => {
    mocks.getSource.mockResolvedValue(structuredClone(source));
    mocks.fetch.mockReset().mockReturnValue(new Promise(() => undefined));
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("shows animated, question-type-specific progress while generating", async () => {
    render(<QuizConfigurator sourceId={source.id} />);

    fireEvent.click(await screen.findByRole("button", { name: /生成这份测验/ }));

    expect(await screen.findByText("单选题正在生成…")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("模型会先覆盖知识点");
    expect(screen.getByRole("button", { name: /AI 正在编排题目/ })).toBeDisabled();
  });
});
