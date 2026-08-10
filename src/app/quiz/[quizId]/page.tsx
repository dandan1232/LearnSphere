import { QuizPreview } from "@/components/quiz-preview";

export const metadata = { title: "题库已生成" };

export default async function QuizPage(props: PageProps<"/quiz/[quizId]">) {
  const { quizId } = await props.params;
  return <QuizPreview quizId={quizId} />;
}
