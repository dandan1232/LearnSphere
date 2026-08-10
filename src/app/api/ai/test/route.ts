import { z } from "zod";

import { aiProviderCredentialsSchema } from "@/lib/ai/contracts";
import { AiError, testAiConnection } from "@/lib/server/ai-client";
import { SourceError } from "@/lib/server/source-errors";

export const runtime = "nodejs";

const requestSchema = z.object({ provider: aiProviderCredentialsSchema });

export async function POST(request: Request) {
  try {
    const { provider } = requestSchema.parse(await request.json());
    await testAiConnection(provider);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
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
