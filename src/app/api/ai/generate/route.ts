import { z } from "zod";

import { aiProviderCredentialsSchema } from "@/lib/ai/contracts";
import { quizConfigSchema, sourceDocumentSchema } from "@/lib/domain/models";
import { AiError } from "@/lib/server/ai-client";
import { generateQuiz } from "@/lib/server/quiz-generator";
import { SourceError } from "@/lib/server/source-errors";
import {
  enforceRateLimit,
  readJsonRequest,
  RequestGuardError,
  requestGuardResponse,
} from "@/lib/server/request-guard";

export const runtime = "nodejs";

const requestSchema = z.object({
  provider: aiProviderCredentialsSchema,
  source: sourceDocumentSchema,
  config: quizConfigSchema,
});

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "ai-generate", 10, 10 * 60_000);
    const input = requestSchema.parse(await readJsonRequest(request, 3_145_728));
    const quiz = await generateQuiz(input.provider, input.source, input.config);
    return Response.json({ quiz });
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardResponse(error);
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json(
        { error: { code: "INVALID_INPUT", message: "题目设置或本地原文不完整，请返回上一步重试。" } },
        { status: 400 },
      );
    }
    if (error instanceof AiError || error instanceof SourceError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "生成题库时出现意外问题，请稍后重试。" } },
      { status: 500 },
    );
  }
}
