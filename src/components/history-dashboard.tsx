"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { Attempt, Question, QuestionResult } from "@/lib/domain/models";
import { listAttempts } from "@/lib/storage/database";

const typeLabel = { single: "单选", multiple: "多选", boolean: "判断", short: "简答" } as const;

function formatDate(timestamp: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function resultState(result: QuestionResult) {
  if (result.awardedPoints === result.maxPoints) return "full";
  if (result.awardedPoints > 0) return "partial";
  return "wrong";
}

interface ReviewRow {
  attempt: Attempt;
  question: Question;
  result: QuestionResult;
  index: number;
}

export function HistoryDashboard() {
  const [attempts, setAttempts] = useState<Attempt[] | undefined>(undefined);
  const [attemptStatus, setAttemptStatus] = useState<"all" | "active" | "completed">("all");
  const [outcome, setOutcome] = useState<"all" | "full" | "partial" | "wrong">("all");
  const [questionType, setQuestionType] = useState<"all" | Question["type"]>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    listAttempts()
      .then((records) => {
        if (active) setAttempts(records);
      })
      .catch(() => {
        if (active) setAttempts([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleAttempts = useMemo(() => {
    if (!attempts) return [];
    return attempts.filter((attempt) => {
      if (attemptStatus === "completed") return attempt.status === "completed";
      if (attemptStatus === "active") return attempt.status !== "completed";
      return true;
    });
  }, [attemptStatus, attempts]);

  const reviewRows = useMemo(() => {
    if (!attempts) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return attempts
      .filter((attempt) => attempt.status === "completed")
      .flatMap<ReviewRow>((attempt) =>
        attempt.quizSnapshot.questions.flatMap((question, index) => {
          const result = attempt.results[question.id];
          return result ? [{ attempt, question, result, index }] : [];
        }),
      )
      .filter((row) => outcome === "all" || resultState(row.result) === outcome)
      .filter((row) => questionType === "all" || row.question.type === questionType)
      .filter((row) => {
        if (!normalizedQuery) return true;
        return [
          row.question.prompt,
          row.question.source.locator,
          row.attempt.quizSnapshot.title,
          ...row.question.knowledgeTags,
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
      });
  }, [attempts, outcome, query, questionType]);

  if (attempts === undefined) return <div className="reading-state" role="status">正在整理本地练习记录…</div>;
  if (attempts.length === 0) {
    return (
      <section className="placeholder-page">
        <p className="section-kicker">HISTORY</p>
        <h1>练习记录还是空的。</h1>
        <p>完成第一份测验后，这里会出现成绩、错题、章节、题型和知识点筛选。</p>
        <Link className="button button--secondary" href="/">创建第一份测验</Link>
      </section>
    );
  }

  return (
    <div className="history-dashboard">
      <header className="history-heading">
        <p className="section-kicker">YOUR RUNS</p>
        <h1>把不会的，筛出来再问一遍。</h1>
        <p>{attempts.length} 场本地练习 · {attempts.filter((item) => item.status === "completed").length} 场已出分</p>
      </header>

      <section className="history-section" aria-labelledby="runs-title">
        <div className="history-section__heading">
          <h2 id="runs-title">练习场次</h2>
          <label>
            <span>状态</span>
            <select value={attemptStatus} onChange={(event) => setAttemptStatus(event.target.value as typeof attemptStatus)}>
              <option value="all">全部场次</option>
              <option value="completed">已完成</option>
              <option value="active">未完成</option>
            </select>
          </label>
        </div>
        <div className="history-runs">
          {visibleAttempts.map((attempt) => (
            <Link
              key={attempt.id}
              href={attempt.status === "completed" ? `/attempt/${attempt.id}/results` : `/attempt/${attempt.id}`}
            >
              <span className="history-run__score">{attempt.score === null ? "—" : Math.round(attempt.score)}</span>
              <span className="history-run__body">
                <strong>{attempt.quizSnapshot.title}</strong>
                <small>{formatDate(attempt.updatedAt)} · {attempt.quizSnapshot.questions.length} 题</small>
              </span>
              <em>{attempt.status === "completed" ? "查看复盘 →" : "继续作答 →"}</em>
            </Link>
          ))}
        </div>
      </section>

      <section className="history-section" aria-labelledby="review-library-title">
        <div className="history-section__heading history-section__heading--stacked">
          <div>
            <p className="section-kicker">REVIEW LIBRARY</p>
            <h2 id="review-library-title">逐题复盘库</h2>
          </div>
          <p>筛出错题或知识点，再进入成绩页追问 AI。</p>
        </div>

        <div className="history-filters">
          <label className="history-search">
            <span>搜索题目、章节或知识点</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：消息驱动" />
          </label>
          <label>
            <span>得分情况</span>
            <select value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}>
              <option value="all">全部结果</option>
              <option value="wrong">未得分</option>
              <option value="partial">部分得分</option>
              <option value="full">完全得分</option>
            </select>
          </label>
          <label>
            <span>题型</span>
            <select value={questionType} onChange={(event) => setQuestionType(event.target.value as typeof questionType)}>
              <option value="all">全部题型</option>
              <option value="single">单选</option>
              <option value="multiple">多选</option>
              <option value="boolean">判断</option>
              <option value="short">简答</option>
            </select>
          </label>
        </div>

        <div className="review-library" aria-live="polite">
          <p className="review-library__count">找到 {reviewRows.length} 道题</p>
          {reviewRows.length > 0 ? reviewRows.map((row) => {
            const state = resultState(row.result);
            return (
              <Link
                key={`${row.attempt.id}-${row.question.id}`}
                href={`/attempt/${row.attempt.id}/results#question-${row.question.id}`}
                className="review-row"
                data-state={state}
              >
                <span>{String(row.index + 1).padStart(2, "0")}</span>
                <div>
                  <small>{typeLabel[row.question.type]} · {row.question.source.locator}</small>
                  <strong>{row.question.prompt}</strong>
                  <em>{row.question.knowledgeTags.join(" · ")}</em>
                </div>
                <b>{row.result.awardedPoints} / {row.result.maxPoints}</b>
              </Link>
            );
          }) : (
            <div className="history-empty-filter">
              <strong>没有匹配的题目</strong>
              <p>换一个得分情况、题型或关键词试试。</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
