import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";

import type { Attempt, Quiz } from "@/lib/domain/models";
import { listAttempts, putAttempt, putQuiz, resetDatabaseConnectionForTests } from "@/lib/storage/database";

const quiz: Quiz = {
  schemaVersion: 1,
  id: "quiz-1",
  title: "AgentScope 快速练习",
  sourceIds: ["source-1"],
  selectedChapterIds: ["chapter-1"],
  config: {
    preset: "quick",
    counts: { single: 1, multiple: 0, boolean: 0, short: 0 },
    difficulty: "mixed",
    outputLanguage: "zh-CN",
  },
  questions: [
    {
      id: "question-1",
      type: "single",
      prompt: "核心模式是什么？",
      options: [
        { id: "a", text: "消息驱动" },
        { id: "b", text: "共享状态" },
      ],
      correctOptionIds: ["a"],
      referenceAnswer: "",
      rubric: [],
      explanation: "原文使用消息驱动。",
      points: 100,
      difficulty: "easy",
      knowledgeTags: ["架构"],
      source: { sectionId: "section-1", locator: "6.3.1", excerpt: "消息驱动" },
    },
  ],
  createdAt: "2026-08-10T04:00:00.000Z",
};

function createAttempt(id: string, updatedAt: string): Attempt {
  return {
    schemaVersion: 1,
    id,
    quizId: quiz.id,
    quizSnapshot: quiz,
    status: "active",
    answers: {},
    results: {},
    assistance: [],
    score: null,
    startedAt: "2026-08-10T04:00:00.000Z",
    updatedAt,
    completedAt: null,
  };
}

describe("local learning database", () => {
  it("stores attempts and returns the most recently updated first", async () => {
    resetDatabaseConnectionForTests();
    await putQuiz(quiz);
    await putAttempt(createAttempt("attempt-old", "2026-08-10T04:05:00.000Z"));
    await putAttempt(createAttempt("attempt-new", "2026-08-10T04:10:00.000Z"));

    const attempts = await listAttempts();
    expect(attempts.map((attempt) => attempt.id)).toEqual(["attempt-new", "attempt-old"]);
  });
});
