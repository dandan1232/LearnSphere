"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Quiz } from "@/lib/domain/models";
import { getQuiz } from "@/lib/storage/database";

const typeLabel = { single: "单选", multiple: "多选", boolean: "判断", short: "简答" } as const;

export function QuizPreview({ quizId }: { quizId: string }) {
  const [quiz, setQuiz] = useState<Quiz | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getQuiz(quizId)
      .then((record) => {
        if (active) setQuiz(record ?? null);
      })
      .catch(() => {
        if (active) setQuiz(null);
      });
    return () => {
      active = false;
    };
  }, [quizId]);

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
    <section className="quiz-preview">
      <p className="section-kicker">QUIZ READY</p>
      <h1>{quiz.title}</h1>
      <p>{quiz.questions.length} 道题已经通过结构校验，每道题都绑定了原文位置。</p>
      <ol>
        {quiz.questions.slice(0, 5).map((question, index) => (
          <li key={question.id}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <small>{typeLabel[question.type]}</small>
              <strong>{question.prompt}</strong>
              <em>{question.source.locator}</em>
            </div>
          </li>
        ))}
      </ol>
      <p className="field-hint">答题与评分界面将在下一个交付增量接入。</p>
    </section>
  );
}
