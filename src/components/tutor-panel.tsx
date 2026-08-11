"use client";

import Link from "next/link";
import { type FormEvent, type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from "react";

import { MarkdownContent } from "@/components/markdown-content";
import {
  tutorThreadSchema,
  type Attempt,
  type Question,
  type QuestionResult,
  type TutorThread,
} from "@/lib/domain/models";
import { getTutorThread, putTutorThread } from "@/lib/storage/database";
import { loadApiKey, loadAppSettings } from "@/lib/storage/settings";

interface TutorPanelProps {
  attempt: Attempt;
  question: Question;
  result: QuestionResult | null;
  mode: "guided" | "review";
  onClose: () => void;
  onUsed: () => void;
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message || "AI 导师暂时无法回答，请稍后重试。";
  } catch {
    return "AI 导师暂时无法回答，请稍后重试。";
  }
}

export function TutorPanel({ attempt, question, result, mode, onClose, onUsed }: TutorPanelProps) {
  const threadId = `thread-${attempt.id}-${question.id}`;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [thread, setThread] = useState<TutorThread | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    let active = true;
    getTutorThread(threadId)
      .then((record) => {
        if (!active) return;
        setThread(
          record ?? {
            schemaVersion: 1,
            id: threadId,
            attemptId: attempt.id,
            questionId: question.id,
            messages: [],
            updatedAt: new Date().toISOString(),
          },
        );
        window.setTimeout(() => inputRef.current?.focus(), 0);
      })
      .catch(() => {
        if (active) setError("无法读取这道题的本地对话记录。");
      });
    return () => {
      active = false;
    };
  }, [attempt.id, question.id, threadId]);

  async function sendMessage(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || !thread || pending) return;
    const provider = loadAppSettings().provider;
    const apiKey = loadApiKey();
    if (!provider.baseUrl || !provider.model || !apiKey) {
      setError("需要先补充模型设置。对话只会保存在当前浏览器。");
      return;
    }

    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/ai/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: { baseUrl: provider.baseUrl, model: provider.model, apiKey },
          input: {
            mode,
            question,
            answer: attempt.answers[question.id] ?? { selectedOptionIds: [], text: "" },
            result,
            history: thread.messages.slice(-12).map(({ role, content }) => ({ role, content })),
            userMessage: message,
          },
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message !== "string" || !body.message.trim()) {
        throw new Error("AI 导师返回了空内容，请重试。");
      }
      const timestamp = new Date().toISOString();
      const nextThread = tutorThreadSchema.parse({
        ...thread,
        messages: [
          ...thread.messages,
          { id: `message-${crypto.randomUUID()}`, role: "user", content: message, createdAt: timestamp },
          {
            id: `message-${crypto.randomUUID()}`,
            role: "assistant",
            content: body.message.trim(),
            createdAt: new Date().toISOString(),
          },
        ],
        updatedAt: new Date().toISOString(),
      });
      await putTutorThread(nextThread);
      setThread(nextThread);
      setDraft("");
      onUsed();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AI 导师暂时无法回答，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  const suggestions = mode === "guided"
    ? ["给我一个思考方向", "我应该回原文看哪个概念？"]
    : ["为什么正确答案是这个？", "我的理解具体错在哪里？"];

  return (
    <div className="tutor-backdrop" onClick={handleBackdropClick}>
      <aside className="tutor-panel" role="dialog" aria-modal="true" aria-labelledby="tutor-title">
        <header className="tutor-panel__header">
          <div>
            <span>{mode === "guided" ? "GUIDED HINT" : "ANSWER REVIEW"}</span>
            <h2 id="tutor-title">{mode === "guided" ? "只提示，不剧透" : "把这道题问明白"}</h2>
          </div>
          <button type="button" aria-label="关闭 AI 导师" onClick={onClose}>×</button>
        </header>

        <div className="tutor-context">
          <strong>{question.prompt}</strong>
          <span>{question.source.locator}</span>
        </div>

        <div className="tutor-messages" aria-live="polite">
          {thread?.messages.length ? thread.messages.map((message) => (
            <div key={message.id} className="tutor-message" data-role={message.role}>
              <span>{message.role === "user" ? "你" : "AI 导师"}</span>
              <MarkdownContent content={message.content} />
            </div>
          )) : (
            <div className="tutor-empty">
              <span aria-hidden="true">?</span>
              <p>{mode === "guided" ? "我会给思路和定位，但不会直接透露答案。" : "可以追问答案依据、扣分原因或容易混淆的概念。"}</p>
            </div>
          )}
          {pending ? <p className="tutor-thinking" role="status">AI 正在结合这道题和原文思考…</p> : null}
        </div>

        <div className="tutor-suggestions" aria-label="快捷问题">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={pending || !thread}
              onClick={() => void sendMessage(suggestion)}
            >
              {suggestion}
              <span aria-hidden="true">↗</span>
            </button>
          ))}
        </div>

        {error ? (
          <div className="notice notice--error" role="alert">
            <p>{error}</p>
            <Link href={`/settings?attempt=${encodeURIComponent(attempt.id)}`}>打开模型设置</Link>
          </div>
        ) : null}

        <form className="tutor-composer" onSubmit={(event) => void ask(event)}>
          <label htmlFor="tutor-question" className="visually-hidden">继续追问</label>
          <textarea
            ref={inputRef}
            id="tutor-question"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="问问为什么、哪里理解错了…"
            rows={3}
            maxLength={4000}
          />
          <button className="button button--primary" type="submit" disabled={pending || !draft.trim()}>
            {pending ? "正在回答…" : "发送问题 →"}
          </button>
          <small className="tutor-composer__hint">Enter 发送 · Shift + Enter 换行</small>
        </form>
      </aside>
    </div>
  );
}
