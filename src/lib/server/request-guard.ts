import "server-only";

interface RateEntry {
  count: number;
  resetAt: number;
}

const globalRateStore = globalThis as typeof globalThis & {
  learnsphereRateLimits?: Map<string, RateEntry>;
};

const rateStore = globalRateStore.learnsphereRateLimits ?? new Map<string, RateEntry>();
globalRateStore.learnsphereRateLimits = rateStore;

export class RequestGuardError extends Error {
  constructor(
    public readonly code: "UNSUPPORTED_MEDIA_TYPE" | "REQUEST_TOO_LARGE" | "INVALID_JSON" | "RATE_LIMITED",
    message: string,
    public readonly status: number,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "RequestGuardError";
  }
}

function clientAddress(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function enforceRateLimit(
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const key = `${bucket}:${clientAddress(request)}`;
  const current = rateStore.get(key);
  if (!current || current.resetAt <= now) {
    rateStore.set(key, { count: 1, resetAt: now + windowMs });
  } else if (current.count >= limit) {
    throw new RequestGuardError(
      "RATE_LIMITED",
      "请求过于频繁，请稍后再试。",
      429,
      Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    );
  } else {
    current.count += 1;
  }

  if (rateStore.size > 5000) {
    for (const [entryKey, entry] of rateStore) {
      if (entry.resetAt <= now) rateStore.delete(entryKey);
    }
  }
}

export async function readJsonRequest(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new RequestGuardError(
      "UNSUPPORTED_MEDIA_TYPE",
      "请求必须使用 application/json。",
      415,
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestGuardError("REQUEST_TOO_LARGE", "请求内容过大，已停止处理。", 413);
  }
  if (!request.body) {
    throw new RequestGuardError("INVALID_JSON", "请求内容不是有效的 JSON。", 400);
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new RequestGuardError("REQUEST_TOO_LARGE", "请求内容过大，已停止处理。", 413);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestGuardError("INVALID_JSON", "请求内容不是有效的 JSON。", 400);
  }
}

export function requestGuardResponse(error: RequestGuardError) {
  const headers = new Headers({ "cache-control": "no-store" });
  if (error.retryAfter) headers.set("retry-after", String(error.retryAfter));
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers },
  );
}

export function resetRateLimitsForTests() {
  rateStore.clear();
}
