"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  sourceDocumentSchema,
  sourceInspectionSchema,
  type SourceInspection,
} from "@/lib/domain/models";
import { putSource } from "@/lib/storage/database";

interface SourceImporterProps {
  initialUrl: string;
}

interface ApiErrorBody {
  error?: { message?: string };
}

async function readApiError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error?.message || fallback;
  } catch {
    return fallback;
  }
}

const adapterLabels: Record<SourceInspection["adapter"], string> = {
  docsify: "Docsify 书籍",
  github: "GitHub Markdown",
  documentation: "技术文档",
  article: "公开文章",
};

export function SourceImporter({ initialUrl }: SourceImporterProps) {
  const router = useRouter();
  const autoStarted = useRef(false);
  const [url, setUrl] = useState(initialUrl);
  const [inspection, setInspection] = useState<SourceInspection | null>(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<"idle" | "inspecting" | "loading">("idle");
  const [error, setError] = useState("");

  const inspect = useCallback(async (targetUrl: string) => {
    const normalizedUrl = targetUrl.trim();
    if (!normalizedUrl) return;
    setStatus("inspecting");
    setError("");
    setInspection(null);

    try {
      const response = await fetch("/api/sources/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "没有成功识别这个页面，请稍后重试。"));
      }

      const body = (await response.json()) as { source?: unknown };
      const parsedInspection = sourceInspectionSchema.parse(body.source);
      const defaults = parsedInspection.chapters.filter((chapter) => chapter.selected).map((chapter) => chapter.id);
      setInspection(parsedInspection);
      setSelectedChapterIds(new Set(defaults.length > 0 ? defaults : [parsedInspection.chapters[0].id]));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "没有成功识别这个页面，请稍后重试。");
    } finally {
      setStatus("idle");
    }
  }, []);

  useEffect(() => {
    if (!initialUrl || autoStarted.current) return;
    autoStarted.current = true;
    void inspect(initialUrl);
  }, [initialUrl, inspect]);

  const filteredChapters = useMemo(() => {
    if (!inspection) return [];
    const normalizedFilter = filter.trim().toLocaleLowerCase();
    if (!normalizedFilter) return inspection.chapters;
    return inspection.chapters.filter((chapter) =>
      chapter.title.toLocaleLowerCase().includes(normalizedFilter),
    );
  }, [filter, inspection]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void inspect(url);
  }

  function toggleChapter(chapterId: string) {
    setError("");
    setSelectedChapterIds((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else if (next.size < 8) {
        next.add(chapterId);
      } else {
        setError("一次最多选择 8 个章节，这样出题更快也更聚焦。");
      }
      return next;
    });
  }

  async function loadSelectedChapters() {
    if (!inspection || selectedChapterIds.size === 0) {
      setError("请至少选择一个章节。 ");
      return;
    }

    setStatus("loading");
    setError("");
    try {
      const selectedChapters = inspection.chapters.filter((chapter) => selectedChapterIds.has(chapter.id));
      const response = await fetch("/api/sources/load", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          originalUrl: inspection.originalUrl,
          title: inspection.title,
          language: inspection.language,
          adapter: inspection.adapter,
          chapters: selectedChapters,
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "章节加载失败，请稍后重试。"));
      }

      const body = (await response.json()) as { source?: unknown };
      const source = sourceDocumentSchema.parse(body.source);
      await putSource(source);
      router.push(`/learn/${source.id}/configure`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "章节加载失败，请稍后重试。");
      setStatus("idle");
    }
  }

  return (
    <div className="import-workspace">
      <header className="workspace-heading">
        <p className="section-kicker">SOURCE CHECK</p>
        <h1>先划定这次要掌握的范围。</h1>
        <p>我们只读取你选择的公开章节，正文和学习记录最终保存在当前浏览器。</p>
      </header>

      <form className="inspect-form" onSubmit={handleSubmit}>
        <label htmlFor="inspect-url">技术文档链接</label>
        <div className="inspect-form__row">
          <input
            id="inspect-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/docs/chapter"
            required
          />
          <button className="button button--primary" type="submit" disabled={status !== "idle"}>
            {status === "inspecting" ? "正在识别章节…" : "重新识别"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="notice notice--error" role="alert">
          <strong>这一步没有完成</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {status === "inspecting" ? (
        <div className="reading-state" role="status" aria-live="polite">
          <span className="reading-state__counter">01</span>
          <div>
            <strong>正在检查页面结构</strong>
            <p>寻找正文、目录和可以单独读取的章节，通常需要几秒钟。</p>
          </div>
        </div>
      ) : null}

      {inspection ? (
        <section className="chapter-picker" aria-labelledby="chapter-picker-title">
          <div className="chapter-picker__summary">
            <div>
              <p className="source-badge">{adapterLabels[inspection.adapter]}</p>
              <h2 id="chapter-picker-title">{inspection.title}</h2>
              <p>
                找到 {inspection.chapters.length} 个可选章节 · 输出语言将跟随
                {inspection.language.startsWith("zh") ? "中文" : "原文"}
              </p>
            </div>
            <div className="selection-score" aria-label={`已选择 ${selectedChapterIds.size} 个章节`}>
              <strong>{String(selectedChapterIds.size).padStart(2, "0")}</strong>
              <span>已选择</span>
            </div>
          </div>

          {inspection.chapters.length > 10 ? (
            <div className="chapter-filter">
              <label htmlFor="chapter-filter">筛选目录</label>
              <input
                id="chapter-filter"
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="输入章节名称"
              />
            </div>
          ) : null}

          <fieldset className="chapter-list">
            <legend className="visually-hidden">选择用于生成测验的章节</legend>
            {filteredChapters.map((chapter, index) => (
              <label
                key={chapter.id}
                className="chapter-option"
                style={{ "--chapter-depth": Math.min(chapter.depth, 3) } as React.CSSProperties}
              >
                <input
                  type="checkbox"
                  checked={selectedChapterIds.has(chapter.id)}
                  onChange={() => toggleChapter(chapter.id)}
                />
                <span className="chapter-option__mark" aria-hidden="true" />
                <span className="chapter-option__index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="chapter-option__title">{chapter.title}</span>
                <span className="chapter-option__state">
                  {selectedChapterIds.has(chapter.id) ? "已加入" : "选择"}
                </span>
              </label>
            ))}
          </fieldset>

          <div className="workspace-actionbar">
            <p>最多选择 8 章；建议一次聚焦 1–3 章。</p>
            <button
              className="button button--secondary"
              type="button"
              disabled={status !== "idle" || selectedChapterIds.size === 0}
              onClick={() => void loadSelectedChapters()}
            >
              {status === "loading" ? "正在保存正文…" : "确认范围，继续设置"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
