"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { SourceDocument } from "@/lib/domain/models";
import { getSource } from "@/lib/storage/database";

export function SourceReady({ sourceId }: { sourceId: string }) {
  const [source, setSource] = useState<SourceDocument | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getSource(sourceId)
      .then((record) => {
        if (active) setSource(record ?? null);
      })
      .catch(() => {
        if (active) setSource(null);
      });
    return () => {
      active = false;
    };
  }, [sourceId]);

  if (source === undefined) {
    return (
      <div className="reading-state" role="status">
        <span className="reading-state__counter">02</span>
        <div>
          <strong>正在打开本地正文</strong>
          <p>这一步不会把内容上传到 LearnSphere 服务器。</p>
        </div>
      </div>
    );
  }

  if (source === null) {
    return (
      <section className="placeholder-page">
        <p className="section-kicker">SOURCE MISSING</p>
        <h1>这个学习范围不在当前浏览器里。</h1>
        <p>可能清理过浏览器数据，或者链接来自另一台设备。请重新导入原文。</p>
        <Link className="button button--secondary" href="/learn/new">
          重新导入文档
        </Link>
      </section>
    );
  }

  return (
    <section className="source-ready">
      <p className="section-kicker">SOURCE READY</p>
      <div className="source-ready__title">
        <div>
          <h1>{source.title}</h1>
          <p>正文已经保存在当前浏览器，下一步将设置题型、难度和 AI 模型。</p>
        </div>
        <span>{source.sections.length} 个知识片段</span>
      </div>
      <ul>
        {source.chapters.map((chapter, index) => (
          <li key={chapter.id}>
            <strong>{String(index + 1).padStart(2, "0")}</strong>
            <span>{chapter.title}</span>
          </li>
        ))}
      </ul>
      <Link className="button button--primary" href={`/settings?source=${encodeURIComponent(source.id)}`}>
        连接 AI 并设置题目
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
