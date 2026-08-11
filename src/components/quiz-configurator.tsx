"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AsyncProcessStatus } from "@/components/async-process-status";
import {
  quizConfigSchema,
  quizSchema,
  type QuizConfig,
  type SourceDocument,
} from "@/lib/domain/models";
import { getSource, putQuiz } from "@/lib/storage/database";
import { loadApiKey, loadAppSettings } from "@/lib/storage/settings";

const presets: Array<{
  id: QuizConfig["preset"];
  name: string;
  description: string;
  counts: QuizConfig["counts"];
}> = [
  {
    id: "quick",
    name: "快速练习",
    description: "5 题 · 约 4 分钟",
    counts: { single: 2, multiple: 1, boolean: 1, short: 1 },
  },
  {
    id: "standard",
    name: "标准测验",
    description: "10 题 · 约 10 分钟",
    counts: { single: 4, multiple: 2, boolean: 2, short: 2 },
  },
  {
    id: "deep",
    name: "深度复习",
    description: "20 题 · 约 22 分钟",
    counts: { single: 8, multiple: 4, boolean: 4, short: 4 },
  },
  {
    id: "custom",
    name: "自定义",
    description: "自己安排题型",
    counts: { single: 4, multiple: 2, boolean: 2, short: 2 },
  },
];

const typeLabels: Record<keyof QuizConfig["counts"], string> = {
  single: "单选",
  multiple: "多选",
  boolean: "判断",
  short: "简答",
};

async function readGenerationError(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message || "题库生成失败，请稍后重试。";
  } catch {
    return "题库生成失败，请稍后重试。";
  }
}

export function QuizConfigurator({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [source, setSource] = useState<SourceDocument | null | undefined>(undefined);
  const [config, setConfig] = useState<QuizConfig>({
    preset: "standard",
    counts: presets[1].counts,
    difficulty: "mixed",
    outputLanguage: "zh-CN",
  });
  const [generating, setGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getSource(sourceId)
      .then((record) => {
        if (!active) return;
        setSource(record ?? null);
        if (record) {
          setConfig((current) => ({ ...current, outputLanguage: record.language }));
        }
      })
      .catch(() => {
        if (active) setSource(null);
      });
    return () => {
      active = false;
    };
  }, [sourceId]);

  const totalQuestions = useMemo(
    () => Object.values(config.counts).reduce((sum, count) => sum + count, 0),
    [config.counts],
  );
  const generationStages = useMemo(
    () => [
      ...(Object.keys(config.counts) as Array<keyof QuizConfig["counts"]>)
        .filter((type) => config.counts[type] > 0)
        .map((type) => `${typeLabels[type]}题正在生成…`),
      "正在校验题目与原文…",
    ],
    [config.counts],
  );

  useEffect(() => {
    if (!generating || generationStages.length < 2) return;
    const interval = window.setInterval(() => {
      setGenerationStage((current) => (current + 1) % generationStages.length);
    }, 1_500);
    return () => window.clearInterval(interval);
  }, [generating, generationStages.length]);
  const providerSettings = loadAppSettings().provider;
  const hasProvider = Boolean(providerSettings.baseUrl && providerSettings.model && loadApiKey());

  function choosePreset(preset: (typeof presets)[number]) {
    setConfig((current) => ({ ...current, preset: preset.id, counts: { ...preset.counts } }));
  }

  function updateCount(type: keyof QuizConfig["counts"], value: number) {
    const maximum = type === "short" ? 10 : 20;
    setConfig((current) => ({
      ...current,
      preset: "custom",
      counts: { ...current.counts, [type]: Math.max(0, Math.min(maximum, value || 0)) },
    }));
  }

  async function generate() {
    if (!source) return;
    const provider = loadAppSettings().provider;
    const apiKey = loadApiKey();
    if (!provider.baseUrl || !provider.model || !apiKey) {
      setError("请先连接一个可用的 AI 模型。 ");
      return;
    }
    const parsedConfig = quizConfigSchema.safeParse(config);
    if (!parsedConfig.success || totalQuestions < 1 || totalQuestions > 30) {
      setError("一次测验需要设置 1 到 30 道题。 ");
      return;
    }

    setGenerating(true);
    setGenerationStage(0);
    setError("");
    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: { baseUrl: provider.baseUrl, model: provider.model, apiKey },
          source,
          config: parsedConfig.data,
        }),
      });
      if (!response.ok) throw new Error(await readGenerationError(response));
      const body = (await response.json()) as { quiz?: unknown };
      const quiz = quizSchema.parse(body.quiz);
      await putQuiz(quiz);
      router.push(`/quiz/${quiz.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "题库生成失败，请稍后重试。");
      setGenerating(false);
    }
  }

  if (source === undefined) {
    return (
      <div className="reading-state" role="status">
        <span className="reading-state__counter">02</span>
        <div>
          <strong>正在打开学习范围</strong>
          <p>从当前浏览器读取正文和章节。</p>
        </div>
      </div>
    );
  }

  if (source === null) {
    return (
      <section className="placeholder-page">
        <p className="section-kicker">SOURCE MISSING</p>
        <h1>没有找到这份本地原文。</h1>
        <p>请重新导入文档；LearnSphere 不会从服务器恢复你的本地学习内容。</p>
        <Link className="button button--secondary" href="/learn/new">
          重新导入文档
        </Link>
      </section>
    );
  }

  return (
    <div className="quiz-configurator">
      <header className="config-heading">
        <p className="section-kicker">QUIZ SETUP</p>
        <h1>{source.title}</h1>
        <p>
          {source.chapters.length} 个章节 · {source.sections.length} 个知识片段
        </p>
      </header>

      {!hasProvider ? (
        <div className="provider-callout">
          <span aria-hidden="true">KEY</span>
          <div>
            <strong>先连接你的 AI 模型</strong>
            <p>Key 默认只在当前浏览器会话中保存，服务器不会落库。</p>
          </div>
          <Link className="button button--secondary" href={`/settings?source=${encodeURIComponent(source.id)}`}>
            打开模型设置
          </Link>
        </div>
      ) : (
        <div className="provider-inline">
          <span className="provider-inline__dot" aria-hidden="true" />
          <p>
            使用 <strong>{providerSettings.model}</strong>
          </p>
          <Link href={`/settings?source=${encodeURIComponent(source.id)}`}>更换模型</Link>
        </div>
      )}

      <section className="config-section" aria-labelledby="preset-title">
        <div className="config-section__heading">
          <span>01</span>
          <div>
            <h2 id="preset-title">选择练习节奏</h2>
            <p>先用预设开始，也可以精确调整每种题型。</p>
          </div>
        </div>
        <div className="preset-grid">
          {presets.map((preset, index) => (
            <button
              key={preset.id}
              className="preset-option"
              data-active={config.preset === preset.id}
              type="button"
              onClick={() => choosePreset(preset)}
            >
              <span className="preset-option__index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <strong>{preset.name}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>
        {config.preset === "custom" ? (
          <div className="count-grid">
            {(Object.keys(config.counts) as Array<keyof QuizConfig["counts"]>).map((type) => (
              <label key={type}>
                <span>{typeLabels[type]}</span>
                <input
                  type="number"
                  min="0"
                  max={type === "short" ? 10 : 20}
                  value={config.counts[type]}
                  onChange={(event) => updateCount(type, Number(event.target.value))}
                />
              </label>
            ))}
          </div>
        ) : null}
      </section>

      <section className="config-section" aria-labelledby="difficulty-title">
        <div className="config-section__heading">
          <span>02</span>
          <div>
            <h2 id="difficulty-title">设置难度与语言</h2>
            <p>混合难度更适合检查真实掌握程度。</p>
          </div>
        </div>
        <div className="config-controls">
          <label>
            <span>难度</span>
            <select
              value={config.difficulty}
              onChange={(event) =>
                setConfig((current) => ({ ...current, difficulty: event.target.value as QuizConfig["difficulty"] }))
              }
            >
              <option value="mixed">混合难度</option>
              <option value="easy">基础巩固</option>
              <option value="medium">理解应用</option>
              <option value="hard">深入挑战</option>
            </select>
          </label>
          <label>
            <span>输出语言</span>
            <select
              value={config.outputLanguage}
              onChange={(event) => setConfig((current) => ({ ...current, outputLanguage: event.target.value }))}
            >
              <option value={source.language}>跟随原文</option>
              {source.language !== "zh-CN" ? <option value="zh-CN">中文</option> : null}
              {source.language !== "en" ? <option value="en">English</option> : null}
            </select>
          </label>
        </div>
      </section>

      {error ? (
        <div className="notice notice--error" role="alert">
          <strong>题库还没有生成</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="generate-bar">
        <div>
          <strong>{totalQuestions}</strong>
          <span>道题 · 满分 100</span>
        </div>
        <button
          className="button button--primary"
          type="button"
          disabled={!hasProvider || generating}
          onClick={() => void generate()}
        >
          {generating ? "AI 正在编排题目…" : "生成这份测验"}
          <span aria-hidden="true">→</span>
        </button>
      </div>
      {generating ? (
        <AsyncProcessStatus
          eyebrow="QUIZ BUILD"
          title={generationStages[generationStage] ?? "AI 正在编排题目…"}
          detail="模型会先覆盖知识点，再检查答案、解析和原文章节是否一致。"
          steps={generationStages.map((stage) => stage.replace("正在", "").replace("…", ""))}
          activeStep={generationStage}
        />
      ) : null}
    </div>
  );
}
