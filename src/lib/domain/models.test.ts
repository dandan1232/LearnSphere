import { describe, expect, it } from "vitest";

import { questionSchema } from "@/lib/domain/models";

const baseQuestion = {
  id: "question-1",
  prompt: "AgentScope 的核心通信方式是什么？",
  explanation: "原文将其描述为消息驱动架构。",
  points: 10,
  difficulty: "medium" as const,
  knowledgeTags: ["AgentScope"],
  source: {
    sectionId: "section-1",
    locator: "6.3.1",
    excerpt: "AgentScope 采用消息驱动模式。",
  },
};

describe("questionSchema", () => {
  it("accepts a source-grounded objective question", () => {
    const result = questionSchema.safeParse({
      ...baseQuestion,
      type: "single",
      options: [
        { id: "a", text: "消息驱动" },
        { id: "b", text: "共享内存" },
      ],
      correctOptionIds: ["a"],
      referenceAnswer: "",
      rubric: [],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a short answer without a rubric", () => {
    const result = questionSchema.safeParse({
      ...baseQuestion,
      type: "short",
      options: [],
      correctOptionIds: [],
      referenceAnswer: "消息驱动降低了组件耦合。",
      rubric: [],
    });

    expect(result.success).toBe(false);
  });
});
