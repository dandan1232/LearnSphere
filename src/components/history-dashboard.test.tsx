import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HistoryDashboard } from "@/components/history-dashboard";
import type { Attempt, Question } from "@/lib/domain/models";

const mocks = vi.hoisted(() => ({ listAttempts: vi.fn() }));

vi.mock("@/lib/storage/database", () => ({ listAttempts: mocks.listAttempts }));

function question(id: string, prompt: string, tag: string): Question {
  return {
    id,
    type: "single",
    prompt,
    options: [
      { id: "A", text: "正确" },
      { id: "B", text: "错误" },
    ],
    correctOptionIds: ["A"],
    referenceAnswer: "",
    rubric: [],
    explanation: "解析",
    points: 50,
    difficulty: "easy",
    knowledgeTags: [tag],
    source: { sectionId: id, locator: `章节 / ${tag}`, excerpt: "原文" },
  };
}

const wrongQuestion = question("wrong-question", "哪项描述了消息驱动？", "消息驱动");
const fullQuestion = question("full-question", "哪项描述了分布式执行？", "分布式");

const attempt: Attempt = {
  schemaVersion: 1,
  id: "attempt-history",
  quizId: "quiz-history",
  quizSnapshot: {
    schemaVersion: 1,
    id: "quiz-history",
    title: "AgentScope 复习",
    sourceIds: ["source-1"],
    selectedChapterIds: ["chapter-1"],
    config: {
      preset: "custom",
      counts: { single: 2, multiple: 0, boolean: 0, short: 0 },
      difficulty: "mixed",
      outputLanguage: "zh-CN",
    },
    questions: [wrongQuestion, fullQuestion],
    createdAt: "2026-08-10T01:00:00.000Z",
  },
  status: "completed",
  answers: {},
  results: {
    [wrongQuestion.id]: {
      questionId: wrongQuestion.id,
      awardedPoints: 0,
      maxPoints: 50,
      correct: false,
      reasoning: "未答对",
      criteria: [],
      gradingStatus: "complete",
    },
    [fullQuestion.id]: {
      questionId: fullQuestion.id,
      awardedPoints: 50,
      maxPoints: 50,
      correct: true,
      reasoning: "正确",
      criteria: [],
      gradingStatus: "complete",
    },
  },
  assistance: [],
  score: 50,
  startedAt: "2026-08-10T01:00:00.000Z",
  updatedAt: "2026-08-10T01:10:00.000Z",
  completedAt: "2026-08-10T01:10:00.000Z",
};

describe("HistoryDashboard", () => {
  beforeEach(() => mocks.listAttempts.mockResolvedValue([attempt]));

  it("filters the review library by outcome and knowledge keyword", async () => {
    render(<HistoryDashboard />);

    expect(await screen.findByText(wrongQuestion.prompt)).toBeInTheDocument();
    expect(screen.getByText(fullQuestion.prompt)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "得分情况" }), { target: { value: "wrong" } });
    expect(screen.getByText(wrongQuestion.prompt)).toBeInTheDocument();
    expect(screen.queryByText(fullQuestion.prompt)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "搜索题目、章节或知识点" }), {
      target: { value: "不存在的概念" },
    });
    expect(screen.getByText("没有匹配的题目")).toBeInTheDocument();
  });
});
