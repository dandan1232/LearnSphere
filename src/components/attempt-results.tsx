"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { Attempt } from "@/lib/domain/models";
import { getAttempt } from "@/lib/storage/database";

const typeLabel = { single: "单选", multiple: "多选", boolean: "判断", short: "简答" } as const;

export function AttemptResults({ attemptId }: { attemptId: string }) {
  const [attempt, setAttempt] = useState<Attempt | null | undefined>(undefined);

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

  const summary = useMemo(() => {
    if (!attempt) return { full: 0, partial: 0, wrong: 0 };
    return Object.values(attempt.results).reduce(
      (counts, result) => {
        if (result.awardedPoints === result.maxPoints) counts.full += 1;
        else if (result.awardedPoints > 0) counts.partial += 1;
        else counts.wrong += 1;
        return counts;
      },
      { full: 0, partial: 0, wrong: 0 },
    );
  }, [attempt]);

  if (attempt === undefined) return <div className="reading-state" role="status">正在汇总本地成绩…</div>;
  if (attempt === null) {
    return <section className="placeholder-page"><h1>没有找到这份成绩。</h1><Link className="button button--secondary" href="/">返回学习台</Link></section>;
  }
  if (attempt.status !== "completed") {
    return <section className="placeholder-page"><h1>这场测验还没完成。</h1><Link className="button button--primary" href={`/attempt/${attempt.id}`}>继续作答</Link></section>;
  }

  return (
    <section className="attempt-results">
      <header className="result-hero">
        <div>
          <p className="section-kicker">RUN COMPLETE</p>
          <h1>{attempt.quizSnapshot.title}</h1>
          <p>得分、评分理由和原文证据均已保存在当前浏览器。</p>
        </div>
        <div className="result-score" aria-label={`得分 ${attempt.score} 分`}>
          <strong>{Math.round(attempt.score ?? 0)}</strong>
          <span>/ 100</span>
        </div>
      </header>

      <dl className="result-summary">
        <div><dt>完全得分</dt><dd>{summary.full}</dd></div>
        <div><dt>部分得分</dt><dd>{summary.partial}</dd></div>
        <div><dt>未得分</dt><dd>{summary.wrong}</dd></div>
      </dl>

      <div className="result-heading">
        <div>
          <p className="section-kicker">QUESTION REVIEW</p>
          <h2>逐题评分</h2>
        </div>
        <p>展开题目查看答案、理由与原文片段。</p>
      </div>

      <div className="result-list">
        {attempt.quizSnapshot.questions.map((question, index) => {
          const result = attempt.results[question.id];
          const answer = attempt.answers[question.id];
          if (!result) return null;
          const state = result.awardedPoints === result.maxPoints ? "full" : result.awardedPoints > 0 ? "partial" : "wrong";
          const selectedAnswer = question.options
            .filter((option) => answer?.selectedOptionIds.includes(option.id))
            .map((option) => `${option.id}. ${option.text}`)
            .join("；");
          const correctAnswer = question.options
            .filter((option) => question.correctOptionIds.includes(option.id))
            .map((option) => `${option.id}. ${option.text}`)
            .join("；");
          return (
            <details key={question.id} className="result-item" data-state={state}>
              <summary>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <small>{typeLabel[question.type]} · {question.source.locator}</small>
                  <strong>{question.prompt}</strong>
                </div>
                <em>{result.awardedPoints} / {result.maxPoints}</em>
              </summary>
              <div className="result-item__body">
                <section>
                  <h3>你的答案</h3>
                  <p>{question.type === "short" ? answer?.text || "未作答" : selectedAnswer || "未作答"}</p>
                </section>
                {question.type === "short" ? (
                  <section>
                    <h3>评分理由</h3>
                    <p>{result.reasoning}</p>
                    <ul className="criterion-list">
                      {result.criteria.map((criterion) => (
                        <li key={criterion.criterionId}>
                          <strong>{criterion.awardedPoints} / {criterion.maxPoints}</strong>
                          <span>{criterion.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : (
                  <section>
                    <h3>正确答案与解析</h3>
                    <p><strong>{correctAnswer}</strong> · {question.explanation}</p>
                  </section>
                )}
                <blockquote>
                  <strong>原文证据 · {question.source.locator}</strong>
                  <p>{question.source.excerpt}</p>
                </blockquote>
              </div>
            </details>
          );
        })}
      </div>

      <div className="result-actions">
        <Link className="button button--secondary" href={`/quiz/${attempt.quizId}`}>再测一次</Link>
        <Link className="button button--primary" href="/history">查看练习记录 →</Link>
      </div>
    </section>
  );
}
