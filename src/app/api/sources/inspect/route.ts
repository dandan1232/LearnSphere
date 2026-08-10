import { z } from "zod";

import { SourceError } from "@/lib/server/source-errors";
import { inspectSource } from "@/lib/server/source-adapters";
import {
  enforceRateLimit,
  readJsonRequest,
  RequestGuardError,
  requestGuardResponse,
} from "@/lib/server/request-guard";

export const runtime = "nodejs";

const requestSchema = z.object({
  url: z.url().max(2048),
});

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "source-inspect", 30, 10 * 60_000);
    const input = requestSchema.parse(await readJsonRequest(request, 16_384));
    const source = await inspectSource(input.url);
    return Response.json({ source });
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardResponse(error);
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: { code: "INVALID_INPUT", message: "请粘贴完整、有效的公开网页链接。" } },
        { status: 400 },
      );
    }
    if (error instanceof SourceError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "解析页面时出现了意外问题，请稍后重试。" } },
      { status: 500 },
    );
  }
}
