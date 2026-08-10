import { z } from "zod";

import { aiProviderCredentialsSchema } from "@/lib/ai/contracts";
import { AiError, testAiConnection } from "@/lib/server/ai-client";
import { SourceError } from "@/lib/server/source-errors";
import {
  enforceRateLimit,
  readJsonRequest,
  RequestGuardError,
  requestGuardResponse,
} from "@/lib/server/request-guard";

export const runtime = "nodejs";

const requestSchema = z.object({ provider: aiProviderCredentialsSchema });

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "ai-test", 20, 10 * 60_000);
    const { provider } = requestSchema.parse(await readJsonRequest(request, 32_768));
    await testAiConnection(provider);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardResponse(error);
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json(
        { error: { code: "INVALID_INPUT", message: "请完整填写 HTTPS 接口地址、模型名称和 API Key。" } },
        { status: 400 },
      );
    }
    if (error instanceof AiError || error instanceof SourceError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "连接测试出现意外问题，请稍后重试。" } },
      { status: 500 },
    );
  }
}
