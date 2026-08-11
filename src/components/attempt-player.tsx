"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AsyncProcessStatus } from "@/components/async-process-status";
import { TutorPanel } from "@/components/tutor-panel";
import {
  attemptSchema,
  questionResultSchema,
  type Attempt,
  type LearnerAnswer,
} from "@/lib/domain/models";
import { calculateAttemptScore, scoreBlankShortQuestion, scoreObjectiveAnswers } from "@/lib/scoring";
import { getAttempt, putAttempt } from "@/lib/storage/database";
import { loadApiKey, loadAppSettings } from "@/lib/storage/settings";

const typeLabel = { single: "单选题", multiple: "多选题", boolean: "判断题", short: "简答题" } as const;
type GradingPhase = "objective" | "short" | "summary";

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message || "评分失败，请稍后重试。";
  } catch {
    return "评分失败，请稍后重试。";
  }
}

export function AttemptPlayer({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null | undefined>(undefined);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradingPhase, setGradingPhase] = useState<GradingPhase>("objective");
  const [error, setError] = useState("");
  const [tutorOpen, setTutorOpen] = useState(false);
  const questionStageRef = useRef<HTMLElement>(null);
  const shouldAlignQuestion = useRef(false);

  useEffect(() => {
    let active = true;
    getAttempt(attemptId)
      .then((record) => {
        if (active) setAttempt(record ?? null);
      })
      .catch(() => {
        if (active) setAttempt(null);
      });
    return () => {
      active = false;
    };
  }, [attemptId]);

  useEffect(() => {
    if (!attempt || attempt.status === "completed") return;
    const timeout = window.setTimeout(() => {
      putAttempt(attempt).finally(() => setSaving(false));
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [attempt]);

  const question = attempt?.quizSnapshot.questions[currentIndex];
  const answer = question ? attempt?.answers[question.id] ?? { selectedOptionIds: [], text: "" } : undefined;
  const answeredCount = useMemo(() => {
    if (!attempt) return 0;
    return attempt.quizSnapshot.questions.filter((item) => {
      const itemAnswer = attempt.answers[item.id];
      return item.type === "short" ? Boolean(itemAnswer?.text.trim()) : Boolean(itemAnswer?.selectedOptionIds.length);
    }).length;
  }, [attempt]);

  useEffect(() => {
    if (!shouldAlignQuestion.current) return;
    shouldAlignQuestion.current = false;
    const frame = window.requestAnimationFrame(() => {
      questionStageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentIndex]);

  function updateAnswer(nextAnswer: LearnerAnswer) {
    if (!attempt || !question) return;
    setSaving(true);
    setAttempt({
      ...attempt,
      status: "active",
      answers: { ...attempt.answers, [question.id]: nextAnswer },
      updatedAt: new Date().toISOString(),
    });
    setError("");
  }

  function recordAssistance() {
    if (!attempt || !question) return;
    const nextAttempt = attemptSchema.parse({
      ...attempt,
      assistance: [
        ...attempt.assistance,
        { questionId: question.id, mode: "guided", usedAt: new Date().toISOString() },
      ],
      updatedAt: new Date().toISOString(),
    });
    setAttempt(nextAttempt);
    void putAttempt(nextAttempt);
  }

  function selectOption(optionId: string) {
    if (!question || !answer) return;
    if (question.type === "multiple") {
      const selected = new Set(answer.selectedOptionIds);
      if (selected.has(optionId)) selected.delete(optionId);
      else selected.add(optionId);
      updateAnswer({ ...answer, selectedOptionIds: [...selected] });
      return;
    }
    updateAnswer({ ...answer, selectedOptionIds: [optionId] });
  }

  async function moveTo(index: number) {
    if (!attempt) return;
    await putAttempt(attempt);
    shouldAlignQuestion.current = true;
    setCurrentIndex(Math.max(0, Math.min(attempt.quizSnapshot.questions.length - 1, index)));
  }

  async function submitAttempt() {
    if (!attempt || grading) return;
    const objectiveResults = scoreObjectiveAnswers(attempt.quizSnapshot, attempt.answers);
    const gradingAttempt = attemptSchema.parse({
      ...attempt,
      status: "grading",
      results: objectiveResults,
      updatedAt: new Date().toISOString(),
    });
    setAttempt(gradingAttempt);
    setGrading(true);
    setGradingPhase(
      attempt.quizSnapshot.questions.some((item) => item.type !== "short") ? "objective" : "short",
    );
    setError("");
    await putAttempt(gradingAttempt);

    try {
      let results = objectiveResults;
      const shortQuestions = attempt.quizSnapshot.questions.filter((item) => item.type === "short");
      if (shortQuestions.length > 0) {
        setGradingPhase("short");
        if (shortQuestions.every((item) => !attempt.answers[item.id]?.text.trim())) {
          const blankResults = Object.fromEntries(
            shortQuestions.map((item) => [item.id, scoreBlankShortQuestion(item)]),
          );
          results = { ...objectiveResults, ...blankResults };
        } else {
          const provider = loadAppSettings().provider;
          const apiKey = loadApiKey();
          if (!provider.baseUrl || !provider.model || !apiKey) {
            throw new Error(
              "简答题需要原出题模型评分，请先在模型设置中补回 API Key。你的答案已经保存。",
            );
          }
          const response = await fetch("/api/ai/grade", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              provider: { baseUrl: provider.baseUrl, model: provider.model, apiKey },
              quiz: attempt.quizSnapshot,
              answers: attempt.answers,
            }),
          });
          if (!response.ok) throw new Error(await readError(response));
          const body = (await response.json()) as { results?: unknown };
          const rawResults = (body.results ?? {}) as Record<string, unknown>;
          const shortResults = Object.fromEntries(
            shortQuestions.map((shortQuestion) => {
              const result = questionResultSchema.parse(rawResults[shortQuestion.id]);
              if (result.questionId !== shortQuestion.id || result.gradingStatus !== "complete") {
                throw new Error("评分结果与题目无法对应，请重新提交评分。");
              }
              return [shortQuestion.id, result];
            }),
          );
          results = { ...objectiveResults, ...shortResults };
        }
      }

      setGradingPhase("summary");
      const timestamp = new Date().toISOString();
      const completed = attemptSchema.parse({
        ...gradingAttempt,
        status: "completed",
        results,
        score: calculateAttemptScore(results),
        updatedAt: timestamp,
        completedAt: timestamp,
      });
      await putAttempt(completed);
      setAttempt(completed);
      router.push(`/attempt/${attempt.id}/results`);
    } catch (reason) {
      const retryable = attemptSchema.parse({ ...gradingAttempt, status: "active", updatedAt: new Date().toISOString() });
      await putAttempt(retryable);
      setAttempt(retryable);
      setError(reason instanceof Error ? reason.message : "评分失败，请稍后重试。");
      setGrading(false);
      setGradingPhase("objective");
    }
  }

  if (attempt === undefined) return <div className="reading-state" role="status">正在恢复答题进度…</div>;
  if (attempt === null) {
    return (
      <section className="placeholder-page">
        <h1>没有找到这次本地作答。</h1>
        <Link className="button button--secondary" href="/">返回学习台</Link>
      </section>
    );
  }
  if (attempt.status === "completed") {
    return (
      <section className="placeholder-page">
        <p className="section-kicker">RUN COMPLETE</p>
        <h1>这场测验已经完成。</h1>
        <Link className="button button--primary" href={`/attempt/${attempt.id}/results`}>查看得分与解析</Link>
      </section>
    );
  }
  if (!question || !answer) return null;

  const progress = ((currentIndex + 1) / attempt.quizSnapshot.questions.length) * 100;
  const hasObjectiveQuestions = attempt.quizSnapshot.questions.some((item) => item.type !== "short");
  const hasShortQuestions = attempt.quizSnapshot.questions.some((item) => item.type === "short");
  const gradingSteps = [
    ...(hasObjectiveQuestions ? ["核对客观题"] : []),
    ...(hasShortQuestions ? ["评阅简答题"] : []),
    "汇总得分",
  ];
  const gradingActiveStep = gradingPhase === "summary"
    ? gradingSteps.length - 1
    : gradingSteps.indexOf(gradingPhase === "objective" ? "核对客观题" : "评阅简答题");
  return (
    <section className="attempt-player">
      <header className="attempt-topline">
        <div>
          <p>{attempt.quizSnapshot.title}</p>
          <span>{saving ? "正在保存…" : "已自动保存"}</span>
        </div>
        <strong>{currentIndex + 1} / {attempt.quizSnapshot.questions.length}</strong>
      </header>
      <div className="attempt-progress" aria-label={`答题进度 ${Math.round(progress)}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <article ref={questionStageRef} className="question-stage">
        <div className="question-stage__meta">
          <span>{typeLabel[question.type]}</span>
          <span>{question.points} 分</span>
          <span>{question.source.locator}</span>
        </div>
        <h1>{question.prompt}</h1>
        {question.type === "multiple" ? <p className="question-instruction">可选择多个答案；选对部分可得部分分，错选会扣分。</p> : null}
        {question.type === "short" ? (
          <label className="short-answer">
            <span>你的回答</span>
            <textarea
              aria-label="你的回答"
              value={answer.text}
              onChange={(event) => updateAnswer({ ...answer, text: event.target.value })}
              placeholder="用自己的话说明关键概念、关系或步骤…"
              rows={8}
              maxLength={12000}
            />
            <small>{answer.text.length} / 12000</small>
          </label>
        ) : (
          <div className="answer-options" role="group" aria-label="答案选项">
            {question.options.map((option) => {
              const checked = answer.selectedOptionIds.includes(option.id);
              return (
                <label key={option.id} className="answer-option" data-selected={checked}>
                  <input
                    type={question.type === "multiple" ? "checkbox" : "radio"}
                    name={`question-${question.id}`}
                    checked={checked}
                    onChange={() => selectOption(option.id)}
                  />
                  <span>{option.id}</span>
                  <strong>{option.text}</strong>
                </label>
              );
            })}
          </div>
        )}
      </article>

      <button className="tutor-trigger" type="button" onClick={() => setTutorOpen(true)}>
        <span aria-hidden="true">?</span>
        <strong>问 AI 要一个提示</strong>
        <em>只引导，不直接给答案 →</em>
      </button>

      {error ? (
        <div className="notice notice--error" role="alert">
          <strong>还没有完成评分</strong>
          <p>{error}</p>
          <Link href={`/settings?attempt=${encodeURIComponent(attempt.id)}`}>打开模型设置</Link>
        </div>
      ) : null}

      <nav className="attempt-actions" aria-label="题目导航">
        <button className="button button--secondary" type="button" disabled={currentIndex === 0 || grading} onClick={() => void moveTo(currentIndex - 1)}>
          ← 上一题
        </button>
        <span>{answeredCount} / {attempt.quizSnapshot.questions.length} 已作答</span>
        {currentIndex < attempt.quizSnapshot.questions.length - 1 ? (
          <button className="button button--primary" type="button" disabled={grading} onClick={() => void moveTo(currentIndex + 1)}>
            下一题 →
          </button>
        ) : (
          <button className="button button--primary" type="button" disabled={grading} onClick={() => void submitAttempt()}>
            {grading ? "正在评阅答案…" : "提交并查看得分"}
          </button>
        )}
      </nav>
      {grading ? (
        <AsyncProcessStatus
          eyebrow="ANSWER REVIEW"
          title={
            gradingPhase === "objective"
              ? "正在核对客观题…"
              : gradingPhase === "short"
                ? "正在评阅简答题…"
                : "正在汇总得分与解析…"
          }
          detail={
            gradingPhase === "short"
              ? "AI 会逐项对照评分标准，并说明得分理由。"
              : "答案会先完成确定性计分，再合并成最终成绩。"
          }
          steps={gradingSteps}
          activeStep={Math.max(0, gradingActiveStep)}
        />
      ) : null}
      {tutorOpen ? (
        <TutorPanel
          attempt={attempt}
          question={question}
          result={null}
          mode="guided"
          onClose={() => setTutorOpen(false)}
          onUsed={recordAssistance}
        />
      ) : null}
    </section>
  );
}
