import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AttemptPlayer } from "@/components/attempt-player";
import type { Attempt } from "@/lib/domain/models";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  getAttempt: vi.fn(),
  putAttempt: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/storage/database", () => ({
  getAttempt: mocks.getAttempt,
  putAttempt: mocks.putAttempt,
}));
vi.mock("@/lib/storage/settings", () => ({
  loadAppSettings: () => ({
    provider: { baseUrl: "https://api.example.com/v1", model: "study-model" },
  }),
  loadApiKey: () => "test-key",
}));

const attempt: Attempt = {
  schemaVersion: 1,
  id: "attempt-objective",
  quizId: "quiz-objective",
  quizSnapshot: {
    schemaVersion: 1,
    id: "quiz-objective",
    title: "客观题验收",
    sourceIds: ["source-1"],
    selectedChapterIds: ["chapter-1"],
    config: {
      preset: "custom",
      counts: { single: 1, multiple: 0, boolean: 0, short: 0 },
      difficulty: "mixed",
      outputLanguage: "zh-CN",
    },
    questions: [
      {
        id: "question-1",
        type: "single",
        prompt: "正确选项是哪一个？",
        options: [
          { id: "A", text: "正确答案" },
          { id: "B", text: "干扰项" },
        ],
        correctOptionIds: ["A"],
        referenceAnswer: "",
        rubric: [],
        explanation: "A 来自原文。",
        points: 100,
        difficulty: "easy",
        knowledgeTags: ["验收"],
        source: { sectionId: "section-1", locator: "第一节", excerpt: "原文证据" },
      },
    ],
    createdAt: "2026-08-10T01:00:00.000Z",
  },
  status: "active",
  answers: {},
  results: {},
  assistance: [],
  score: null,
  startedAt: "2026-08-10T01:01:00.000Z",
  updatedAt: "2026-08-10T01:01:00.000Z",
  completedAt: null,
};

const shortAttempt: Attempt = {
  ...structuredClone(attempt),
  id: "attempt-short",
  quizId: "quiz-short",
  quizSnapshot: {
    ...structuredClone(attempt.quizSnapshot),
    id: "quiz-short",
    config: {
      ...attempt.quizSnapshot.config,
      counts: { single: 0, multiple: 0, boolean: 0, short: 1 },
    },
    questions: [{
      ...structuredClone(attempt.quizSnapshot.questions[0]),
      id: "question-short",
      type: "short",
      options: [],
      correctOptionIds: [],
      referenceAnswer: "应说明核心概念。",
      rubric: [{ id: "criterion-1", description: "说明核心概念", points: 100 }],
    }],
  },
};

describe("AttemptPlayer", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.putAttempt.mockClear();
    mocks.getAttempt.mockResolvedValue(structuredClone(attempt));
  });

  it("scores an objective-only attempt, persists completion, and opens results", async () => {
    render(<AttemptPlayer attemptId={attempt.id} />);

    fireEvent.click(await screen.findByRole("radio", { name: /正确答案/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交并查看得分" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/attempt/${attempt.id}/results`));
    const completed = mocks.putAttempt.mock.calls
      .map(([record]) => record as Attempt)
      .find((record) => record.status === "completed");
    expect(completed).toMatchObject({ score: 100, completedAt: expect.any(String) });
    expect(completed?.results["question-1"]).toMatchObject({ awardedPoints: 100, correct: true });
  });

  it("shows the short-answer grading phase while waiting for AI", async () => {
    mocks.getAttempt.mockResolvedValue(structuredClone(shortAttempt));
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => undefined)));
    render(<AttemptPlayer attemptId={shortAttempt.id} />);

    fireEvent.change(await screen.findByPlaceholderText("用自己的话说明关键概念、关系或步骤…"), {
      target: { value: "这是我的简答内容。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交并查看得分" }));

    expect(await screen.findByText("正在评阅简答题…")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("逐项对照评分标准");
  });
});
