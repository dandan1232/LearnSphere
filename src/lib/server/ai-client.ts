import "server-only";

import { request } from "undici";
import { z } from "zod";

import type { AiProviderCredentials } from "@/lib/ai/contracts";
import { createSafeDispatcher, parsePublicUrl } from "@/lib/server/safe-fetch";

const AI_TIMEOUT_MS = 90_000;
const MAX_AI_RESPONSE_BYTES = 2_500_000;

export type AiErrorCode =
  | "INVALID_PROVIDER"
  | "AUTH_FAILED"
  | "MODEL_NOT_FOUND"
  | "RATE_LIMITED"
  | "PROVIDER_FAILED"
  | "AI_TIMEOUT"
  | "INVALID_RESPONSE";

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatRequestOptions {
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
}

const providerResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.union([
          z.string(),
          z.array(
            z.object({
              type: z.string().optional(),
              text: z.string().optional(),
            }),
          ),
        ]),
      }),
    }),
  ),
});

function chatEndpoint(baseUrl: string) {
  const parsedUrl = parsePublicUrl(baseUrl);
  if (parsedUrl.protocol !== "https:") {
    throw new AiError("INVALID_PROVIDER", "公开部署只允许连接 HTTPS 模型接口。", 400);
  }

  const normalizedPath = parsedUrl.pathname.replace(/\/+$/, "");
  parsedUrl.pathname = normalizedPath.endsWith("/chat/completions")
    ? normalizedPath
    : `${normalizedPath}/chat/completions`.replace(/\/+/g, "/");
  parsedUrl.search = "";
  parsedUrl.hash = "";
  return parsedUrl;
}

function providerStatusError(statusCode: number) {
  if (statusCode === 401 || statusCode === 403) {
    return new AiError("AUTH_FAILED", "API Key 无效或没有调用这个模型的权限。", 401);
  }
  if (statusCode === 404) {
    return new AiError("MODEL_NOT_FOUND", "没有找到接口或模型，请检查 Base URL 和模型名称。", 404);
  }
  if (statusCode === 429) {
    return new AiError("RATE_LIMITED", "模型接口当前请求过多或额度不足，请稍后重试。", 429);
  }
  return new AiError("PROVIDER_FAILED", `模型接口返回了 ${statusCode}，请稍后重试。`, 502);
}

async function readResponseBody(body: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for await (const chunk of body) {
    totalBytes += chunk.byteLength;
    if (totalBytes > MAX_AI_RESPONSE_BYTES) {
      throw new AiError("INVALID_RESPONSE", "模型返回内容过长，已停止读取。", 502);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function extractMessageContent(value: z.infer<typeof providerResponseSchema>) {
  const content = value.choices[0]?.message.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => part.text ?? "")
      .join("\n")
      .trim();
  }
  return "";
}

export async function createChatCompletion(
  provider: AiProviderCredentials,
  options: ChatRequestOptions,
) {
  const endpoint = chatEndpoint(provider.baseUrl);
  const dispatcher = await createSafeDispatcher(endpoint);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await request(endpoint, {
      dispatcher,
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${provider.apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "LearnSphere/0.1 (+https://learnsphere.nianan.ggff.net)",
      },
      body: JSON.stringify({
        model: provider.model,
        messages: options.messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: false,
      }),
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw providerStatusError(response.statusCode);
    }

    let body: unknown;
    try {
      body = JSON.parse(await readResponseBody(response.body));
    } catch (error) {
      if (error instanceof AiError) throw error;
      throw new AiError("INVALID_RESPONSE", "模型没有返回有效的 JSON 响应。", 502);
    }

    const parsed = providerResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new AiError("INVALID_RESPONSE", "模型响应不符合兼容接口格式。", 502);
    }
    const content = extractMessageContent(parsed.data);
    if (!content) {
      throw new AiError("INVALID_RESPONSE", "模型返回了空内容，请换一个模型重试。", 502);
    }
    return content;
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (controller.signal.aborted) {
      throw new AiError("AI_TIMEOUT", "模型超过 90 秒没有完成响应，请减少题目或稍后重试。", 408);
    }
    throw new AiError("PROVIDER_FAILED", "无法连接到模型接口，请检查 Base URL 和网络。", 502);
  } finally {
    clearTimeout(timeout);
    await dispatcher.close();
  }
}

export async function testAiConnection(provider: AiProviderCredentials) {
  const content = await createChatCompletion(provider, {
    messages: [
      { role: "system", content: "Reply with exactly: OK" },
      { role: "user", content: "Connection test" },
    ],
    maxTokens: 16,
    temperature: 0,
  });
  return content;
}
