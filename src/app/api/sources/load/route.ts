import { z } from "zod";

import { sourceChapterSchema, sourceDocumentSchema } from "@/lib/domain/models";
import { loadSelectedSource } from "@/lib/server/source-adapters";
import { SourceError } from "@/lib/server/source-errors";
import {
  enforceRateLimit,
  readJsonRequest,
  RequestGuardError,
  requestGuardResponse,
} from "@/lib/server/request-guard";

export const runtime = "nodejs";

const requestSchema = z.object({
  originalUrl: z.url().max(2048),
  title: z.string().min(1).max(300),
  language: z.string().min(2).max(16),
  adapter: sourceDocumentSchema.shape.adapter,
  chapters: z.array(sourceChapterSchema).min(1).max(8),
});

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "source-load", 12, 10 * 60_000);
    const input = requestSchema.parse(await readJsonRequest(request, 65_536));
    const source = await loadSelectedSource(
      input.originalUrl,
      input.title,
      input.language,
      input.adapter,
      input.chapters,
    );
    return Response.json({ source });
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardResponse(error);
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: { code: "INVALID_INPUT", message: "请选择 1 到 8 个有效章节。" } },
        { status: 400 },
      );
    }
    if (error instanceof SourceError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "加载章节时出现了意外问题，请稍后重试。" } },
      { status: 500 },
    );
  }
}
