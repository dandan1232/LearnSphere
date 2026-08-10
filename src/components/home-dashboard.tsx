"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Attempt } from "@/lib/domain/models";
import { listAttempts } from "@/lib/storage/database";

function formatAttemptDate(timestamp: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function HomeDashboard() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  useEffect(() => {
    let active = true;
    listAttempts()
      .then((records) => {
        if (active) setAttempts(records.slice(0, 4));
      })
      .catch(() => {
        if (active) setAttempts([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="home-layout">
      <section className="launch-panel" aria-labelledby="launch-title">
        <div className="eyebrow">
          <span className="eyebrow__dot" aria-hidden="true" />
          AI 主动回忆训练
        </div>
        <h1 id="launch-title">把昨晚读过的，今天真正答出来。</h1>
        <p className="launch-panel__lead">
          粘贴技术文档或在线书籍。LearnSphere 会识别章节、生成测验，并在你卡住时只给恰到好处的提示。
        </p>
        <form className="source-form" action="/learn/new" method="get">
          <label htmlFor="source-url">从一个公开链接开始</label>
          <div className="source-form__row">
            <input
              id="source-url"
              name="url"
              type="url"
              inputMode="url"
              placeholder="https://example.com/guide/chapter-1"
              autoComplete="url"
              required
            />
            <button className="button button--primary" type="submit">
              解析并出题
              <span aria-hidden="true">→</span>
            </button>
          </div>
          <p className="field-hint">支持公开文章、GitHub Markdown、Docsify 和 VitePress 文档。</p>
        </form>
        <div className="trust-line" aria-label="隐私说明">
          <span>Key 不上云</span>
          <span>记录留本机</span>
          <span>答案有出处</span>
        </div>
      </section>

      <aside className="scoreboard" aria-labelledby="scoreboard-title">
        <div className="scoreboard__topline">
          <p>今日挑战</p>
          <span>READY</span>
        </div>
        <h2 id="scoreboard-title">一次十题，测出真正会的部分。</h2>
        <ol className="scoreboard__steps">
          <li>
            <strong>01</strong>
            <span>选章节</span>
          </li>
          <li>
            <strong>02</strong>
            <span>做测验</span>
          </li>
          <li>
            <strong>03</strong>
            <span>追问 AI</span>
          </li>
        </ol>
        <div className="scoreboard__streak">
          <span aria-hidden="true">↗</span>
          <p>
            <strong>理解，不靠猜。</strong>
            每道题都绑定原文证据。
          </p>
        </div>
      </aside>

      <section className="recent-section" aria-labelledby="recent-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">YOUR RUNS</p>
            <h2 id="recent-title">最近练习</h2>
          </div>
          <Link href="/history">查看全部</Link>
        </div>
        {attempts.length > 0 ? (
          <ul className="attempt-list">
            {attempts.map((attempt) => (
              <li key={attempt.id}>
                <Link href={attempt.status === "completed" ? `/attempt/${attempt.id}/results` : `/attempt/${attempt.id}`}>
                  <span className="attempt-list__score">
                    {attempt.score === null ? "—" : Math.round(attempt.score)}
                  </span>
                  <span className="attempt-list__body">
                    <strong>{attempt.quizSnapshot.title}</strong>
                    <small>{formatAttemptDate(attempt.updatedAt)}</small>
                  </span>
                  <span className="attempt-list__status">
                    {attempt.status === "completed" ? "查看复盘" : "继续作答"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-run">
            <span className="empty-run__number" aria-hidden="true">
              00
            </span>
            <div>
              <h3>你的第一场还没开始</h3>
              <p>贴入刚读完的一章，十分钟后你会知道自己到底记住了什么。</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
