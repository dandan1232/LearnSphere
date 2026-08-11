import { describe, expect, it, vi } from "vitest";

import type { AiProviderCredentials } from "@/lib/ai/contracts";
import type { QuizConfig, SourceDocument } from "@/lib/domain/models";
import { AiError, createChatCompletion } from "@/lib/server/ai-client";
import { buildSourceContext, generateQuiz, normalizeGeneratedQuiz } from "@/lib/server/quiz-generator";

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
      text: "智能体会先观察环境，再根据目标选择行动，并根据环境反馈继续调整后续行动。".repeat(4),
    },
    {
      id: "section-memory",
      chapterId: "chapter-1",
      title: "记忆",
      locator: "第一章 / 记忆",
      text: "短期记忆保存当前任务上下文，长期记忆用于跨任务检索稳定知识。".repeat(4),
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

const provider: AiProviderCredentials = {
  baseUrl: "https://api.example.com/v1",
  model: "quiz-model",
  apiKey: "test-key",
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

function aliasedDraft() {
  const draft = validDraft();
  draft.questions[0].sectionId = "S001";
  draft.questions[1].sectionId = "S002";
  return draft;
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

    expect(() => normalizeGeneratedQuiz(draft, source, config)).toThrowError(
      expect.objectContaining({
        code: "INVALID_RESPONSE",
        message: "第 1 题使用了不存在的原文章节标识“invented-section”。",
      }),
    );
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
      expect.objectContaining({
        code: "INVALID_RESPONSE",
        status: 502,
        message: expect.stringContaining("题目列表"),
      }),
    );
  });

  it("rejects whitespace-only model fields before constructing the final quiz", () => {
    const draft = validDraft();
    draft.questions[0].explanation = "    ";

    expect(() => normalizeGeneratedQuiz(draft, source, config)).toThrowError(
      expect.objectContaining({
        code: "INVALID_RESPONSE",
        message: expect.stringContaining("第 1 题的答案解析"),
      }),
    );
  });

  it("regenerates once with strict repair instructions after an incomplete response", async () => {
    const completion = vi.fn<typeof createChatCompletion>()
      .mockResolvedValueOnce(JSON.stringify({
        title: "字段不完整的题库",
        questions: [{ type: "single", prompt: "智能体先做什么？" }],
      }))
      .mockResolvedValueOnce(JSON.stringify(aliasedDraft()));

    const quiz = await generateQuiz(provider, source, config, completion);

    expect(quiz.questions).toHaveLength(2);
    expect(completion).toHaveBeenCalledTimes(2);
    expect(completion.mock.calls[1][1].temperature).toBe(0);
    expect(completion.mock.calls[1][1].messages.at(-1)?.content).toContain("第 1 题的答案解析");
    expect(completion.mock.calls[1][1].messages.at(-1)?.content).toContain("never omit a field");
  });

  it("lists allowed source section ids when repairing an invented section reference", async () => {
    const inventedReference = aliasedDraft();
    inventedReference.questions[0].sectionId = "S999";
    const completion = vi.fn<typeof createChatCompletion>()
      .mockResolvedValueOnce(JSON.stringify(inventedReference))
      .mockResolvedValueOnce(JSON.stringify(aliasedDraft()));

    const quiz = await generateQuiz(provider, source, config, completion);

    expect(quiz.questions).toHaveLength(2);
    expect(quiz.questions.map((question) => question.source.sectionId)).toEqual([
      "section-observe",
      "section-memory",
    ]);
    const repairPrompt = completion.mock.calls[1][1].messages.at(-1)?.content ?? "";
    expect(repairPrompt).toContain("第 1 题使用了不存在的原文章节别名“S999”");
    expect(repairPrompt).toContain("Allowed sectionId values");
    expect(repairPrompt).toContain("S001\nS002");
  });

  it("returns actionable field details when the repair attempt also fails", async () => {
    const incomplete = JSON.stringify({
      title: "字段不完整的题库",
      questions: [{ type: "single", prompt: "智能体先做什么？" }],
    });
    const completion = vi.fn<typeof createChatCompletion>().mockResolvedValue(incomplete);

    await expect(generateQuiz(provider, source, config, completion)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
      message: expect.stringMatching(/已自动重试一次.*第 1 题的答案解析/),
    });
    expect(completion).toHaveBeenCalledTimes(2);
  });

  it("logs rejected raw responses without logging the API key when diagnostics are enabled", async () => {
    const originalSetting = process.env.LOG_REJECTED_AI_RESPONSES;
    process.env.LOG_REJECTED_AI_RESPONSES = "1";
    const incomplete = JSON.stringify({
      title: "标签格式错误",
      questions: [{
        type: "single",
        prompt: "智能体先做什么？",
        explanation: "根据原文解释。",
        difficulty: "easy",
        knowledgeTags: [0, 1],
        sectionId: "section-observe",
      }],
    });
    const completion = vi.fn<typeof createChatCompletion>().mockResolvedValue(incomplete);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(generateQuiz(provider, source, config, completion)).rejects.toThrow(
        "第 1 题的知识点标签第 1 项",
      );
      expect(errorLog).toHaveBeenCalledTimes(2);
      const entry = JSON.parse(String(errorLog.mock.calls[0][0])) as {
        event: string;
        allowedSectionIds: string[];
        response: { raw: string; truncated: boolean };
      };
      expect(entry.event).toBe("quiz_generation_response_rejected");
      expect(entry.allowedSectionIds).toEqual(["S001", "S002"]);
      expect(entry.response).toMatchObject({ raw: incomplete, truncated: false });
      expect(String(errorLog.mock.calls[0][0])).not.toContain(provider.apiKey);
    } finally {
      errorLog.mockRestore();
      if (originalSetting === undefined) delete process.env.LOG_REJECTED_AI_RESPONSES;
      else process.env.LOG_REJECTED_AI_RESPONSES = originalSetting;
    }
  });

  it("keeps every rubric criterion valid when many short answers split a small score", () => {
    const shortHeavyConfig: QuizConfig = {
      preset: "custom",
      counts: { single: 0, multiple: 0, boolean: 0, short: 10 },
      difficulty: "mixed",
      outputLanguage: "zh-CN",
    };
    const draft = {
      title: "简答题边界测验",
      questions: Array.from({ length: 10 }, (_value, index) => ({
        type: "short",
        prompt: `说明智能体知识点 ${index + 1} 的作用。`,
        options: [],
        correctOptionIds: [],
        referenceAnswer: "根据原文章节说明相关知识点。",
        rubric: [
          { description: "核心概念准确", weight: 10 },
          { description: "作用说明完整", weight: 10 },
          { description: "关联原文证据", weight: 10 },
          { description: "表达逻辑清晰", weight: 10 },
          { description: "补充边界条件", weight: 1 },
        ],
        explanation: "答案需要覆盖概念、作用、证据与边界。",
        difficulty: "medium",
        knowledgeTags: [`知识点 ${index + 1}`],
        sectionId: index % 2 === 0 ? "section-observe" : "section-memory",
      })),
    };

    const quiz = normalizeGeneratedQuiz(draft, source, shortHeavyConfig);

    expect(quiz.questions).toHaveLength(10);
    expect(quiz.questions.flatMap((question) => question.rubric).every((criterion) => criterion.points > 0)).toBe(true);
    for (const question of quiz.questions) {
      expect(question.rubric.reduce((sum, criterion) => sum + criterion.points, 0)).toBeCloseTo(question.points, 8);
    }
    expect(quiz.questions.reduce((sum, question) => sum + question.points, 0)).toBe(100);
  });
});

describe("source context construction", () => {
  it("marks every source block as untrusted content with a short section alias", () => {
    const context = buildSourceContext(source);

    expect(context).toContain('<source_section id="S001"');
    expect(context).toContain('<source_section id="S002"');
    expect(context).not.toContain("section-observe");
    expect(context).not.toContain("section-memory");
    expect(context).toContain("</source_section>");
  });
});
