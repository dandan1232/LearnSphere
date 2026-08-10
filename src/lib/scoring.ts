import {
  type LearnerAnswer,
  type Question,
  type QuestionResult,
  type Quiz,
} from "@/lib/domain/models";

function roundScore(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function objectiveReason(question: Question, awardedPoints: number) {
  if (awardedPoints === question.points) return "答案完全正确。";
  if (awardedPoints > 0) return "部分选项正确，已按多选题规则获得部分分。";
  return "答案不正确或未作答。";
}

export function scoreBlankShortQuestion(question: Question): QuestionResult {
  return {
    questionId: question.id,
    awardedPoints: 0,
    maxPoints: question.points,
    correct: false,
    reasoning: "未填写答案，评分标准均未满足。",
    criteria: question.rubric.map((criterion) => ({
      criterionId: criterion.id,
      awardedPoints: 0,
      maxPoints: criterion.points,
      reason: "答案为空，未体现此项知识点。",
    })),
    gradingStatus: "complete",
  };
}

export function scoreObjectiveQuestion(
  question: Question,
  answer: LearnerAnswer | undefined,
): QuestionResult {
  if (question.type === "short") {
    return {
      questionId: question.id,
      awardedPoints: 0,
      maxPoints: question.points,
      correct: null,
      reasoning: "等待 AI 按评分标准评阅。",
      criteria: [],
      gradingStatus: "pending",
    };
  }

  const selected = new Set(answer?.selectedOptionIds ?? []);
  const correct = new Set(question.correctOptionIds);
  let ratio = 0;

  if (question.type === "multiple") {
    const correctSelections = [...selected].filter((id) => correct.has(id)).length;
    const incorrectOptionCount = Math.max(1, question.options.length - correct.size);
    const incorrectSelections = [...selected].filter((id) => !correct.has(id)).length;
    ratio = Math.max(0, correctSelections / correct.size - incorrectSelections / incorrectOptionCount);
  } else {
    ratio = selected.size === correct.size && [...selected].every((id) => correct.has(id)) ? 1 : 0;
  }

  const awardedPoints = roundScore(question.points * Math.min(1, ratio));
  return {
    questionId: question.id,
    awardedPoints,
    maxPoints: question.points,
    correct: awardedPoints === question.points ? true : awardedPoints === 0 ? false : null,
    reasoning: objectiveReason(question, awardedPoints),
    criteria: [],
    gradingStatus: "complete",
  };
}

export function scoreObjectiveAnswers(
  quiz: Quiz,
  answers: Record<string, LearnerAnswer>,
) {
  return Object.fromEntries(
    quiz.questions.map((question) => [question.id, scoreObjectiveQuestion(question, answers[question.id])]),
  );
}

export function calculateAttemptScore(results: Record<string, QuestionResult>) {
  return roundScore(Object.values(results).reduce((sum, result) => sum + result.awardedPoints, 0));
}
