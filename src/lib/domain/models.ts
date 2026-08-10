import { z } from "zod";

export const questionTypeSchema = z.enum(["single", "multiple", "boolean", "short"]);
export const difficultySchema = z.enum(["easy", "medium", "hard"]);

export const sourceChapterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  depth: z.number().int().min(0).max(6),
  selected: z.boolean().default(false),
});

export const sourceSectionSchema = z.object({
  id: z.string().min(1),
  chapterId: z.string().min(1),
  title: z.string().min(1),
  locator: z.string().min(1),
  text: z.string().min(1),
});

export const sourceDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  url: z.url(),
  title: z.string().min(1),
  language: z.string().min(2).max(16),
  adapter: z.enum(["github", "docsify", "documentation", "article"]),
  chapters: z.array(sourceChapterSchema),
  sections: z.array(sourceSectionSchema),
  contentHash: z.string().min(1),
  importedAt: z.iso.datetime(),
});

export const sourceInspectionSchema = z.object({
  originalUrl: z.url(),
  title: z.string().min(1),
  language: z.string().min(2).max(16),
  adapter: sourceDocumentSchema.shape.adapter,
  chapters: z.array(sourceChapterSchema).min(1),
  sections: z.array(sourceSectionSchema),
});

export const optionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

export const rubricCriterionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  points: z.number().positive(),
});

export const questionSchema = z
  .object({
    id: z.string().min(1),
    type: questionTypeSchema,
    prompt: z.string().min(1),
    options: z.array(optionSchema).max(8).default([]),
    correctOptionIds: z.array(z.string()).max(8).default([]),
    referenceAnswer: z.string().default(""),
    rubric: z.array(rubricCriterionSchema).max(8).default([]),
    explanation: z.string().min(1),
    points: z.number().positive(),
    difficulty: difficultySchema,
    knowledgeTags: z.array(z.string().min(1)).min(1).max(6),
    source: z.object({
      sectionId: z.string().min(1),
      locator: z.string().min(1),
      excerpt: z.string().min(1).max(1200),
    }),
  })
  .superRefine((question, context) => {
    if (question.type === "short" && question.rubric.length === 0) {
      context.addIssue({
        code: "custom",
        message: "简答题必须包含评分标准",
        path: ["rubric"],
      });
    }

    if (question.type !== "short" && question.options.length < 2) {
      context.addIssue({
        code: "custom",
        message: "客观题至少需要两个选项",
        path: ["options"],
      });
    }
  });

export const quizConfigSchema = z.object({
  preset: z.enum(["quick", "standard", "deep", "custom"]),
  counts: z.object({
    single: z.number().int().min(0).max(20),
    multiple: z.number().int().min(0).max(20),
    boolean: z.number().int().min(0).max(20),
    short: z.number().int().min(0).max(10),
  }),
  difficulty: z.enum(["mixed", "easy", "medium", "hard"]),
  outputLanguage: z.string().min(2).max(16),
});

export const quizSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  selectedChapterIds: z.array(z.string().min(1)).min(1),
  config: quizConfigSchema,
  questions: z.array(questionSchema).min(1).max(50),
  createdAt: z.iso.datetime(),
});

export const learnerAnswerSchema = z.object({
  selectedOptionIds: z.array(z.string()).default([]),
  text: z.string().max(12000).default(""),
});

export const criterionResultSchema = z.object({
  criterionId: z.string().min(1),
  awardedPoints: z.number().min(0),
  maxPoints: z.number().positive(),
  reason: z.string().min(1),
});

export const questionResultSchema = z.object({
  questionId: z.string().min(1),
  awardedPoints: z.number().min(0),
  maxPoints: z.number().positive(),
  correct: z.boolean().nullable(),
  reasoning: z.string().default(""),
  criteria: z.array(criterionResultSchema).default([]),
  gradingStatus: z.enum(["complete", "pending", "failed"]),
});

export const assistanceEventSchema = z.object({
  questionId: z.string().min(1),
  mode: z.enum(["guided", "review"]),
  usedAt: z.iso.datetime(),
});

export const attemptSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  quizId: z.string().min(1),
  quizSnapshot: quizSchema,
  status: z.enum(["active", "grading", "completed"]),
  answers: z.record(z.string(), learnerAnswerSchema),
  results: z.record(z.string(), questionResultSchema),
  assistance: z.array(assistanceEventSchema),
  score: z.number().min(0).max(100).nullable(),
  startedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});

export const tutorMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(16000),
  createdAt: z.iso.datetime(),
});

export const tutorThreadSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  messages: z.array(tutorMessageSchema),
  updatedAt: z.iso.datetime(),
});

export type SourceChapter = z.infer<typeof sourceChapterSchema>;
export type SourceSection = z.infer<typeof sourceSectionSchema>;
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;
export type SourceInspection = z.infer<typeof sourceInspectionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuizConfig = z.infer<typeof quizConfigSchema>;
export type Quiz = z.infer<typeof quizSchema>;
export type LearnerAnswer = z.infer<typeof learnerAnswerSchema>;
export type QuestionResult = z.infer<typeof questionResultSchema>;
export type Attempt = z.infer<typeof attemptSchema>;
export type TutorThread = z.infer<typeof tutorThreadSchema>;
