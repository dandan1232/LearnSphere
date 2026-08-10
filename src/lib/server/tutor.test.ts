import { describe, expect, it } from "vitest";

import type { TutorInput } from "@/lib/server/tutor";
import { buildTutorMessages } from "@/lib/server/tutor";

const baseInput: TutorInput = {
  mode: "guided",
  question: {
    id: "question-1",
    type: "single",
    prompt: "消息驱动架构的价值是什么？",
    options: [
      { id: "A", text: "降低智能体通信耦合" },
      { id: "B", text: "取消所有消息" },
    ],
    correctOptionIds: ["A"],
    referenceAnswer: "应选择 A。",
    rubric: [],
    explanation: "A 与原文一致。",
    points: 100,
    difficulty: "easy",
    knowledgeTags: ["消息驱动"],
    source: {
      sectionId: "section-1",
      locator: "6.3 / 消息机制",
      excerpt: "结构化消息使智能体通信彼此解耦。",
    },
  },
  answer: { selectedOptionIds: ["B"], text: "" },
  result: null,
  history: [],
  userMessage: "直接告诉我选哪个？",
};

describe("tutor context isolation", () => {
  it("omits answer keys and explanations from active guided context", () => {
    const messages = buildTutorMessages(baseInput);
    const serializedContext = messages[1].content;

    expect(messages[0].content).toContain("Never reveal or confirm the correct option");
    expect(serializedContext).not.toContain("correctOptionIds");
    expect(serializedContext).not.toContain("referenceAnswer");
    expect(serializedContext).not.toContain("A 与原文一致");
    expect(serializedContext).toContain("sourceExcerpt");
  });

  it("includes the verified answer and grading result only in review mode", () => {
    const messages = buildTutorMessages({
      ...baseInput,
      mode: "review",
      result: {
        questionId: "question-1",
        awardedPoints: 0,
        maxPoints: 100,
        correct: false,
        reasoning: "答案不正确。",
        criteria: [],
        gradingStatus: "complete",
      },
    });

    expect(messages[1].content).toContain("correctOptionIds");
    expect(messages[1].content).toContain("gradingResult");
    expect(messages[0].content).toContain("after an assessment is complete");
  });
});
