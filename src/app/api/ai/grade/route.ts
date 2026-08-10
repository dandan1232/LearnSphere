import { z } from "zod";

import { aiProviderCredentialsSchema } from "@/lib/ai/contracts";
import { learnerAnswerSchema, quizSchema } from "@/lib/domain/models";
import { AiError } from "@/lib/server/ai-client";
import { gradeShortAnswers } from "@/lib/server/short-answer-grader";
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
  quiz: quizSchema,
  answers: z.record(z.string(), learnerAnswerSchema),
});

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "ai-grade", 15, 10 * 60_000);
    const input = requestSchema.parse(await readJsonRequest(request, 1_048_576));
    const results = await gradeShortAnswers(input.provider, input.quiz, input.answers);
    return Response.json({ results });
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardResponse(error);
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json(
        { error: { code: "INVALID_INPUT", message: "简答题或作答记录不完整，请刷新后重试。" } },
        { status: 400 },
      );
    }
    if (error instanceof AiError || error instanceof SourceError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "简答评分出现意外问题，请稍后重试。" } },
      { status: 500 },
    );
  }
}
