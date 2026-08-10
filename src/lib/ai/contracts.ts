import { z } from "zod";

export const aiProviderCredentialsSchema = z.object({
  baseUrl: z.url().max(2048),
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().trim().min(1).max(1000),
});

export type AiProviderCredentials = z.infer<typeof aiProviderCredentialsSchema>;

export const aiApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
