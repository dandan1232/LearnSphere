"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useSyncExternalStore } from "react";

import { aiProviderCredentialsSchema } from "@/lib/ai/contracts";
import {
  DEFAULT_APP_SETTINGS,
  loadApiKey,
  loadAppSettings,
  saveApiKey,
  saveAppSettings,
  type AppSettings,
} from "@/lib/storage/settings";

interface AiSettingsFormProps {
  returnSourceId: string;
}

interface StoredProviderSnapshot {
  settings: AppSettings;
  apiKey: string;
}

function subscribeToBrowserStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getBrowserSnapshot() {
  return JSON.stringify({ settings: loadAppSettings(), apiKey: loadApiKey() });
}

function getServerSnapshot() {
  return JSON.stringify({ settings: DEFAULT_APP_SETTINGS, apiKey: "" });
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message || "连接测试失败，请检查配置。";
  } catch {
    return "连接测试失败，请检查配置。";
  }
}

function SettingsFields({ initial, returnSourceId }: { initial: StoredProviderSnapshot; returnSourceId: string }) {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState(initial.settings.provider.baseUrl);
  const [model, setModel] = useState(initial.settings.provider.model);
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [rememberKey, setRememberKey] = useState(initial.settings.provider.rememberKey);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  function credentials() {
    return aiProviderCredentialsSchema.safeParse({ baseUrl, model, apiKey });
  }

  async function testConnection() {
    const parsed = credentials();
    if (!parsed.success) {
      setMessage({ kind: "error", text: "请完整填写 HTTPS 接口地址、模型名称和 API Key。" });
      return false;
    }

    setTesting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: parsed.data }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage({ kind: "success", text: "连接成功，这个模型可以用于生成和评分。" });
      return true;
    } catch (reason) {
      setMessage({
        kind: "error",
        text: reason instanceof Error ? reason.message : "连接测试失败，请检查配置。",
      });
      return false;
    } finally {
      setTesting(false);
    }
  }

  function save() {
    const parsed = credentials();
    if (!parsed.success) {
      setMessage({ kind: "error", text: "请完整填写 HTTPS 接口地址、模型名称和 API Key。" });
      return false;
    }
    if (!parsed.data.baseUrl.startsWith("https://")) {
      setMessage({ kind: "error", text: "部署环境只允许 HTTPS 模型接口，避免 API Key 被明文传输。" });
      return false;
    }

    const current = loadAppSettings();
    saveAppSettings({
      ...current,
      provider: { baseUrl: parsed.data.baseUrl, model: parsed.data.model, rememberKey },
    });
    saveApiKey(parsed.data.apiKey, rememberKey);
    return true;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!save()) return;
    setMessage({ kind: "success", text: "模型设置已保存在当前浏览器。" });
    if (returnSourceId) router.push(`/learn/${returnSourceId}/configure`);
  }

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      <div className="settings-field">
        <label htmlFor="provider-base-url">Base URL</label>
        <input
          id="provider-base-url"
          type="url"
          inputMode="url"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://api.openai.com/v1"
          autoComplete="url"
          required
        />
        <p>填写兼容 OpenAI Chat Completions 的 HTTPS 根地址，末尾可带 `/v1`。</p>
      </div>

      <div className="settings-field">
        <label htmlFor="provider-model">模型名称</label>
        <input
          id="provider-model"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="填写供应商提供的模型 ID"
          autoComplete="off"
          required
        />
      </div>

      <div className="settings-field">
        <label htmlFor="provider-key">API Key</label>
        <div className="secret-field">
          <input
            id="provider-key"
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
            required
          />
          <button type="button" onClick={() => setShowKey((visible) => !visible)}>
            {showKey ? "隐藏" : "显示"}
          </button>
        </div>
      </div>

      <label className="remember-option">
        <input
          type="checkbox"
          checked={rememberKey}
          onChange={(event) => setRememberKey(event.target.checked)}
        />
        <span>
          <strong>记住在此设备</strong>
          <small>关闭时，浏览器会话结束后自动清除 Key；服务器始终不保存。</small>
        </span>
      </label>

      {message ? (
        <div className={`notice notice--${message.kind}`} role="status" aria-live="polite">
          <p>{message.text}</p>
        </div>
      ) : null}

      <div className="settings-actions">
        <button className="button button--secondary" type="button" disabled={testing} onClick={() => void testConnection()}>
          {testing ? "正在连接模型…" : "测试连接"}
        </button>
        <button className="button button--primary" type="submit">
          {returnSourceId ? "保存并继续设置题目" : "保存模型设置"}
        </button>
      </div>
    </form>
  );
}

export function AiSettingsForm({ returnSourceId }: AiSettingsFormProps) {
  const snapshot = useSyncExternalStore(subscribeToBrowserStorage, getBrowserSnapshot, getServerSnapshot);
  const initial = JSON.parse(snapshot) as StoredProviderSnapshot;
  return <SettingsFields key={snapshot} initial={initial} returnSourceId={returnSourceId} />;
}
