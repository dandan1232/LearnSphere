import { describe, expect, it } from "vitest";

import type { QuizConfig, SourceDocument } from "@/lib/domain/models";
import { AiError } from "@/lib/server/ai-client";
import { buildSourceContext, normalizeGeneratedQuiz } from "@/lib/server/quiz-generator";

const source: SourceDocument = {
  schemaVersion: 1,
  id: "source-agent",
  url: "https://example.com/agents",
  title: "智能体入门",
  language: "zh-CN",
  adapter: "documentation",
  chapters: [
    {
      id: "chapter-1",
      title: "第一章",
      url: "https://example.com/agents/one",
      depth: 0,
      selected: true,
    },
  ],
  sections: [
    {
      id: "section-observe",
      chapterId: "chapter-1",
      title: "观察与行动",
      locator: "第一章 / 观察与行动",
      text: "智能体会先观察环境，再根据目标选择行动，并根据环境反馈继续调整后续行动。",
    },
    {
      id: "section-memory",
      chapterId: "chapter-1",
      title: "记忆",
      locator: "第一章 / 记忆",
      text: "短期记忆保存当前任务上下文，长期记忆用于跨任务检索稳定知识。",
    },
  ],
  contentHash: "hash",
  importedAt: "2026-08-10T01:00:00.000Z",
};

const config: QuizConfig = {
  preset: "custom",
  counts: { single: 1, multiple: 0, boolean: 0, short: 1 },
  difficulty: "mixed",
  outputLanguage: "zh-CN",
};

function validDraft() {
  return {
    title: "智能体核心机制测验",
    questions: [
      {
        type: "single",
        prompt: "智能体选择行动之前首先需要做什么？",
        options: [
          { id: "A", text: "观察环境" },
          { id: "B", text: "清空记忆" },
          { id: "C", text: "结束任务" },
        ],
        correctOptionIds: ["A"],
        referenceAnswer: "",
        rubric: [],
        explanation: "原文明确说明智能体先观察环境，再根据目标选择行动。",
        difficulty: "easy",
        knowledgeTags: ["智能体循环"],
        sectionId: "section-observe",
      },
      {
        type: "short",
        prompt: "比较短期记忆与长期记忆的用途。",
        options: [],
        correctOptionIds: [],
        referenceAnswer: "短期记忆保存当前上下文，长期记忆支持跨任务知识检索。",
        rubric: [
          { description: "说明短期记忆保存当前任务上下文", weight: 1 },
          { description: "说明长期记忆支持跨任务知识检索", weight: 1 },
        ],
        explanation: "两类记忆的差异在于时间范围与检索用途。",
        difficulty: "medium",
        knowledgeTags: ["记忆"],
        sectionId: "section-memory",
      },
    ],
  };
}

describe("quiz generation normalization", () => {
  it("grounds excerpts in the source and allocates the configured 70/30 score", () => {
    const quiz = normalizeGeneratedQuiz(validDraft(), source, config);

    expect(quiz.questions.map((question) => question.points)).toEqual([70, 30]);
    expect(quiz.questions.reduce((sum, question) => sum + question.points, 0)).toBe(100);
    expect(quiz.questions[0].source.excerpt).toContain("先观察环境");
    expect(quiz.questions[1].rubric.reduce((sum, criterion) => sum + criterion.points, 0)).toBe(30);
  });

  it("rejects model-provided section identifiers that do not exist", () => {
    const draft = validDraft();
    draft.questions[0].sectionId = "invented-section";

    expect(() => normalizeGeneratedQuiz(draft, source, config)).toThrowError(AiError);
  });

  it("rejects duplicate option identifiers and repeated questions", () => {
    const duplicateOptionDraft = validDraft();
    duplicateOptionDraft.questions[0].options[1].id = "A";
    expect(() => normalizeGeneratedQuiz(duplicateOptionDraft, source, config)).toThrowError(AiError);

    const duplicateQuestionDraft = validDraft();
    duplicateQuestionDraft.questions[1].prompt = duplicateQuestionDraft.questions[0].prompt;
    expect(() => normalizeGeneratedQuiz(duplicateQuestionDraft, source, config)).toThrowError(AiError);
  });

  it("converts malformed model output into a provider response error", () => {
    expect(() => normalizeGeneratedQuiz({ title: "缺少题目" }, source, config)).toThrowError(
      expect.objectContaining({ code: "INVALID_RESPONSE", status: 502 }),
    );
  });
});

describe("source context construction", () => {
  it("marks every source block as untrusted content with an exact section id", () => {
    const context = buildSourceContext(source);

    expect(context).toContain('<source_section id="section-observe"');
    expect(context).toContain('<source_section id="section-memory"');
    expect(context).toContain("</source_section>");
  });
});
