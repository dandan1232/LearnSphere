import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TutorPanel } from "@/components/tutor-panel";
import type { Attempt } from "@/lib/domain/models";

const mocks = vi.hoisted(() => ({
  getTutorThread: vi.fn(),
  putTutorThread: vi.fn().mockResolvedValue(undefined),
  fetch: vi.fn(),
}));

vi.mock("@/lib/storage/database", () => ({
  getTutorThread: mocks.getTutorThread,
  putTutorThread: mocks.putTutorThread,
}));
vi.mock("@/lib/storage/settings", () => ({
  loadAppSettings: () => ({
    provider: { baseUrl: "https://api.example.com/v1", model: "study-model" },
  }),
  loadApiKey: () => "test-key",
}));

const attempt: Attempt = {
  schemaVersion: 1,
  id: "attempt-tutor",
  quizId: "quiz-tutor",
  quizSnapshot: {
    schemaVersion: 1,
    id: "quiz-tutor",
    title: "问答交互验收",
    sourceIds: ["source-1"],
    selectedChapterIds: ["chapter-1"],
    config: {
      preset: "custom",
      counts: { single: 1, multiple: 0, boolean: 0, short: 0 },
      difficulty: "mixed",
      outputLanguage: "zh-CN",
    },
    questions: [{
      id: "question-1",
      type: "single",
      prompt: "为什么选择 A？",
      options: [
        { id: "A", text: "正确选项" },
        { id: "B", text: "干扰项" },
      ],
      correctOptionIds: ["A"],
      referenceAnswer: "",
      rubric: [],
      explanation: "A 与原文一致。",
      points: 100,
      difficulty: "easy",
      knowledgeTags: ["概念"],
      source: { sectionId: "section-1", locator: "第一节", excerpt: "原文支持 A。" },
    }],
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

describe("TutorPanel", () => {
  beforeEach(() => {
    mocks.putTutorThread.mockClear();
    mocks.getTutorThread.mockResolvedValue(undefined);
    mocks.fetch.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ message: "## 思考方向\n\n先比较两个选项。" }),
    });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("sends a suggestion immediately and renders the Markdown response", async () => {
    render(
      <TutorPanel
        attempt={attempt}
        question={attempt.quizSnapshot.questions[0]}
        result={null}
        mode="guided"
        onClose={vi.fn()}
        onUsed={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /给我一个思考方向/ }));

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    const request = JSON.parse(String(mocks.fetch.mock.calls[0][1]?.body)) as {
      input: { userMessage: string };
    };
    expect(request.input.userMessage).toBe("给我一个思考方向");
    expect(await screen.findByRole("heading", { name: "思考方向" })).toBeInTheDocument();
  });

  it("uses Enter to send and Shift+Enter to insert a line break", async () => {
    render(
      <TutorPanel
        attempt={attempt}
        question={attempt.quizSnapshot.questions[0]}
        result={null}
        mode="guided"
        onClose={vi.fn()}
        onUsed={vi.fn()}
      />,
    );

    const composer = await screen.findByRole("textbox", { name: "继续追问" });
    fireEvent.change(composer, { target: { value: "第一行" } });
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    fireEvent.change(composer, { target: { value: "第一行\n第二行" } });
    expect(composer).toHaveValue("第一行\n第二行");
    expect(mocks.fetch).not.toHaveBeenCalled();

    fireEvent.keyDown(composer, { key: "Enter" });

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    const request = JSON.parse(String(mocks.fetch.mock.calls[0][1]?.body)) as {
      input: { userMessage: string };
    };
    expect(request.input.userMessage).toBe("第一行\n第二行");
  });

  it("closes from the backdrop or Escape without closing from panel clicks", async () => {
    const onClose = vi.fn();
    const { container, unmount } = render(
      <TutorPanel
        attempt={attempt}
        question={attempt.quizSnapshot.questions[0]}
        result={null}
        mode="guided"
        onClose={onClose}
        onUsed={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = container.querySelector(".tutor-backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);

    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
