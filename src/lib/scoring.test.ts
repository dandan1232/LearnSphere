import { describe, expect, it } from "vitest";

import type { Question } from "@/lib/domain/models";
import { calculateAttemptScore, scoreObjectiveQuestion } from "@/lib/scoring";

function question(overrides: Partial<Question>): Question {
  return {
    id: "question-1",
    type: "single",
    prompt: "示例题目",
    options: [
      { id: "A", text: "A" },
      { id: "B", text: "B" },
      { id: "C", text: "C" },
      { id: "D", text: "D" },
    ],
    correctOptionIds: ["A"],
    referenceAnswer: "",
    rubric: [],
    explanation: "解释",
    points: 20,
    difficulty: "medium",
    knowledgeTags: ["测试"],
    source: { sectionId: "section-1", locator: "第一节", excerpt: "原文" },
    ...overrides,
  };
}

describe("objective scoring", () => {
  it("requires an exact answer for single-choice and judgment questions", () => {
    expect(
      scoreObjectiveQuestion(question({}), { selectedOptionIds: ["A"], text: "" }).awardedPoints,
    ).toBe(20);
    expect(
      scoreObjectiveQuestion(question({}), { selectedOptionIds: ["A", "B"], text: "" }).awardedPoints,
    ).toBe(0);
  });

  it("awards multiple-choice partial credit and penalizes incorrect selections", () => {
    const multiple = question({ type: "multiple", correctOptionIds: ["A", "B"], points: 30 });

    expect(
      scoreObjectiveQuestion(multiple, { selectedOptionIds: ["A"], text: "" }).awardedPoints,
    ).toBe(15);
    expect(
      scoreObjectiveQuestion(multiple, { selectedOptionIds: ["A", "B", "C"], text: "" }).awardedPoints,
    ).toBe(15);
    expect(
      scoreObjectiveQuestion(multiple, { selectedOptionIds: ["C", "D"], text: "" }).awardedPoints,
    ).toBe(0);
  });

  it("marks short answers as pending and sums completed results precisely", () => {
    const pending = scoreObjectiveQuestion(
      question({ type: "short", options: [], correctOptionIds: [], rubric: [{ id: "r1", description: "要点", points: 30 }] }),
      { selectedOptionIds: [], text: "回答" },
    );

    expect(pending.gradingStatus).toBe("pending");
    expect(
      calculateAttemptScore({
        one: { ...pending, awardedPoints: 12.5, gradingStatus: "complete" },
        two: { ...pending, questionId: "two", awardedPoints: 57.25, gradingStatus: "complete" },
      }),
    ).toBe(69.75);
  });
});
