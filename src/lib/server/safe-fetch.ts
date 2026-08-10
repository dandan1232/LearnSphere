import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { Agent, request } from "undici";

import { SourceError } from "@/lib/server/source-errors";

const MAX_RESPONSE_BYTES = 2_500_000;
const MAX_REDIRECTS = 4;
const REQUEST_TIMEOUT_MS = 15_000;
const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/xhtml+xml",
];

export interface SafeFetchResult {
  url: string;
  contentType: string;
  body: string;
}

function parseIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
}

export function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateAddress(mappedIpv4);

  if (isIP(normalized) === 4) {
    const parts = parseIpv4(normalized);
    if (!parts) return true;
    const [first, second] = parts;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }

  if (isIP(normalized) === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff")
    );
  }

  return true;
}

export function parsePublicUrl(rawUrl: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    throw new SourceError("INVALID_URL", "链接格式不正确，请粘贴完整的 http 或 https 地址。", 400);
  }

  if (!(["http:", "https:"] as string[]).includes(parsedUrl.protocol)) {
    throw new SourceError("INVALID_URL", "目前只支持 http 和 https 链接。", 400);
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new SourceError("BLOCKED_URL", "链接不能包含用户名或密码。", 400);
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new SourceError("BLOCKED_URL", "出于安全考虑，不能读取本机或内网链接。", 400);
  }

  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new SourceError("BLOCKED_URL", "出于安全考虑，不能读取本机或内网地址。", 400);
  }

  return parsedUrl;
}

async function resolvePublicAddress(hostname: string) {
  if (isIP(hostname)) {
    return { address: hostname, family: isIP(hostname) as 4 | 6 };
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SourceError("FETCH_FAILED", "无法解析这个链接的域名，请检查地址后重试。", 422);
  }

  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new SourceError("BLOCKED_URL", "这个域名指向本机或内网地址，已停止读取。", 400);
  }

  return addresses.find((entry) => entry.family === 4) ?? addresses[0];
}

function getHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function readBoundedBody(body: AsyncIterable<Uint8Array>, contentLength: string) {
  const declaredLength = Number(contentLength);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new SourceError("CONTENT_TOO_LARGE", "页面内容超过 2.5 MB，请改为选择单个章节。", 413);
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for await (const chunk of body) {
    totalBytes += chunk.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      throw new SourceError("CONTENT_TOO_LARGE", "页面内容超过 2.5 MB，请改为选择单个章节。", 413);
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function safeFetchText(rawUrl: string, redirectCount = 0): Promise<SafeFetchResult> {
  const parsedUrl = parsePublicUrl(rawUrl);
  const resolvedAddress = await resolvePublicAddress(parsedUrl.hostname);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => {
        if (_options.all) {
          callback(null, [resolvedAddress]);
          return;
        }
        callback(null, resolvedAddress.address, resolvedAddress.family);
      },
    },
  });

  try {
    const response = await request(parsedUrl, {
      dispatcher,
      method: "GET",
      signal: controller.signal,
      headers: {
        accept: "text/html,text/markdown,text/plain;q=0.9,*/*;q=0.1",
        "user-agent": "LearnSphere/0.1 (+https://learnsphere.nianan.ggff.net)",
      },
    });

    if (response.statusCode >= 300 && response.statusCode < 400) {
      const location = getHeaderValue(response.headers.location);
      if (!location || redirectCount >= MAX_REDIRECTS) {
        throw new SourceError("FETCH_FAILED", "页面重定向次数过多，无法安全读取。", 422);
      }
      const redirectedUrl = new URL(location, parsedUrl);
      return safeFetchText(redirectedUrl.toString(), redirectCount + 1);
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new SourceError(
        "FETCH_FAILED",
        `目标网站返回了 ${response.statusCode}，暂时无法读取正文。`,
        422,
      );
    }

    const contentType = getHeaderValue(response.headers["content-type"])
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new SourceError("UNSUPPORTED_CONTENT", `暂不支持 ${contentType} 类型的内容。`, 415);
    }

    const body = await readBoundedBody(
      response.body,
      getHeaderValue(response.headers["content-length"]),
    );
    if (body.trim().length < 80) {
      throw new SourceError("EMPTY_CONTENT", "页面正文太短，无法生成有效测验。", 422);
    }

    return { url: parsedUrl.toString(), contentType, body };
  } catch (error) {
    if (error instanceof SourceError) throw error;
    if (controller.signal.aborted) {
      throw new SourceError("FETCH_TIMEOUT", "读取页面超过 15 秒，请稍后重试。", 408);
    }
    throw new SourceError("FETCH_FAILED", "无法连接到这个页面，请确认它可以公开访问。", 422);
  } finally {
    clearTimeout(timeout);
    await dispatcher.close();
  }
}
