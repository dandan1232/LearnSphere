"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { attemptSchema, type Attempt, type Quiz } from "@/lib/domain/models";
import { getQuiz, listAttempts, putAttempt } from "@/lib/storage/database";

const typeLabel = { single: "单选", multiple: "多选", boolean: "判断", short: "简答" } as const;
const difficultyLabel = { mixed: "混合", easy: "基础", medium: "进阶", hard: "挑战" } as const;

export function QuizLaunch({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<Quiz | null | undefined>(undefined);
  const [activeAttempt, setActiveAttempt] = useState<Attempt | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getQuiz(quizId), listAttempts()])
      .then(([record, attempts]) => {
        if (!active) return;
        setQuiz(record ?? null);
        setActiveAttempt(attempts.find((attempt) => attempt.quizId === quizId && attempt.status !== "completed") ?? null);
      })
      .catch(() => {
        if (active) setQuiz(null);
      });
    return () => {
      active = false;
    };
  }, [quizId]);

  const typeCounts = useMemo(() => {
    if (!quiz) return [];
    return Object.entries(typeLabel)
      .map(([type, label]) => ({
        type,
        label,
        count: quiz.questions.filter((question) => question.type === type).length,
      }))
      .filter((item) => item.count > 0);
  }, [quiz]);

  async function startAttempt() {
    if (!quiz || starting) return;
    setStarting(true);
    const timestamp = new Date().toISOString();
    const attempt = attemptSchema.parse({
      schemaVersion: 1,
      id: `attempt-${crypto.randomUUID()}`,
      quizId: quiz.id,
      quizSnapshot: quiz,
      status: "active",
      answers: {},
      results: {},
      assistance: [],
      score: null,
      startedAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    });
    await putAttempt(attempt);
    router.push(`/attempt/${attempt.id}`);
  }

  if (quiz === undefined) {
    return <div className="reading-state" role="status">正在打开本地题库…</div>;
  }
  if (quiz === null) {
    return (
      <section className="placeholder-page">
        <h1>没有找到这份本地题库。</h1>
        <Link className="button button--secondary" href="/">
          返回学习台
        </Link>
      </section>
    );
  }

  return (
    <section className="quiz-launch">
      <div className="quiz-launch__heading">
        <p className="section-kicker">QUIZ READY</p>
        <h1>{quiz.title}</h1>
        <p>题目已经逐条绑定原文出处。开始后会自动保存进度，刷新页面也能继续。</p>
      </div>

      <div className="quiz-ticket" aria-label="测验信息">
        <div className="quiz-ticket__score">
          <strong>100</strong>
          <span>满分</span>
        </div>
        <dl>
          <div>
            <dt>题量</dt>
            <dd>{quiz.questions.length} 题</dd>
          </div>
          <div>
            <dt>难度</dt>
            <dd>{difficultyLabel[quiz.config.difficulty]}</dd>
          </div>
          <div>
            <dt>预计</dt>
            <dd>{Math.max(4, Math.ceil(quiz.questions.length * 1.1))} 分钟</dd>
          </div>
        </dl>
      </div>

      <ul className="quiz-type-list" aria-label="题型组成">
        {typeCounts.map((item, index) => (
          <li key={item.type}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{item.label}</strong>
            <em>{item.count} 题</em>
          </li>
        ))}
      </ul>

      <div className="quiz-rules">
        <h2>计分方式</h2>
        <p>客观题占 70 分，简答题占 30 分；多选题选对一部分可得部分分，错选会扣减该题得分。</p>
      </div>

      <div className="quiz-launch__actions">
        {activeAttempt ? (
          <Link className="button button--secondary" href={`/attempt/${activeAttempt.id}`}>
            继续上次作答
          </Link>
        ) : null}
        <button className="button button--primary" type="button" disabled={starting} onClick={() => void startAttempt()}>
          {starting ? "正在准备答题页…" : activeAttempt ? "重新开始一场" : "开始这份测验"}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
