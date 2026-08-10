import { describe, expect, it } from "vitest";

import type { Question } from "@/lib/domain/models";
import { AiError } from "@/lib/server/ai-client";
import { normalizeGeneratedGrades } from "@/lib/server/short-answer-grader";

const question: Question = {
  id: "question-short",
  type: "short",
  prompt: "比较两类记忆。",
  options: [],
  correctOptionIds: [],
  referenceAnswer: "短期记忆保存当前上下文，长期记忆支持跨任务检索。",
  rubric: [
    { id: "criterion-short", description: "说明短期记忆用途", points: 12 },
    { id: "criterion-long", description: "说明长期记忆用途", points: 18 },
  ],
  explanation: "两类记忆服务于不同时间范围。",
  points: 30,
  difficulty: "medium",
  knowledgeTags: ["记忆"],
  source: { sectionId: "section-memory", locator: "记忆", excerpt: "原文内容" },
};

describe("short-answer grade normalization", () => {
  it("maps exact rubric ids and clamps awards to criterion maxima", () => {
    const results = normalizeGeneratedGrades(
      {
        grades: [
          {
            questionId: question.id,
            criteria: [
              { criterionId: "criterion-short", awardedPoints: 20, reason: "准确说明当前上下文。" },
              { criterionId: "criterion-long", awardedPoints: 9, reason: "提到了跨任务，但缺少检索用途。" },
            ],
            feedback: "短期记忆理解准确，长期记忆还需补充。",
          },
        ],
      },
      [question],
    );

    expect(results[question.id].awardedPoints).toBe(21);
    expect(results[question.id].criteria[0].awardedPoints).toBe(12);
    expect(results[question.id].correct).toBeNull();
  });

  it("scores blank answers deterministically without requiring a model grade", () => {
    const results = normalizeGeneratedGrades({ grades: [] }, [question], new Set([question.id]));

    expect(results[question.id]).toMatchObject({ awardedPoints: 0, correct: false, gradingStatus: "complete" });
    expect(results[question.id].criteria).toHaveLength(2);
  });

  it("rejects missing, repeated, or invented rubric identifiers", () => {
    const invalid = {
      grades: [
        {
          questionId: question.id,
          criteria: [
            { criterionId: "invented", awardedPoints: 1, reason: "无效标准" },
          ],
          feedback: "无效评分",
        },
      ],
    };

    expect(() => normalizeGeneratedGrades(invalid, [question])).toThrowError(AiError);
  });
});
