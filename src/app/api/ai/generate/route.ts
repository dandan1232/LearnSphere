import { z } from "zod";

import { aiProviderCredentialsSchema } from "@/lib/ai/contracts";
import { quizConfigSchema, sourceDocumentSchema } from "@/lib/domain/models";
import { AiError } from "@/lib/server/ai-client";
import { generateQuiz } from "@/lib/server/quiz-generator";
import { SourceError } from "@/lib/server/source-errors";

export const runtime = "nodejs";

const requestSchema = z.object({
  provider: aiProviderCredentialsSchema,
  source: sourceDocumentSchema,
  config: quizConfigSchema,
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const quiz = await generateQuiz(input.provider, input.source, input.config);
    return Response.json({ quiz });
  } catch (error) {
    if (error instanceof z.ZodError) {
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
