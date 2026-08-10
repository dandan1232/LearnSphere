import { z } from "zod";

import { aiProviderCredentialsSchema } from "@/lib/ai/contracts";
import { AiError } from "@/lib/server/ai-client";
import { askTutor, tutorInputSchema } from "@/lib/server/tutor";
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
  input: tutorInputSchema,
});

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "ai-tutor", 40, 10 * 60_000);
    const { provider, input } = requestSchema.parse(await readJsonRequest(request, 524_288));
    const message = await askTutor(provider, input);
    return Response.json({ message });
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardResponse(error);
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json(
        { error: { code: "INVALID_INPUT", message: "问题上下文不完整，请刷新后重试。" } },
        { status: 400 },
      );
    }
    if (error instanceof AiError || error instanceof SourceError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "AI 导师暂时无法回答，请稍后重试。" } },
      { status: 500 },
    );
  }
}
