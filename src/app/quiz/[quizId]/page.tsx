import { QuizLaunch } from "@/components/quiz-launch";

export const metadata = { title: "开始测验" };

export default async function QuizPage(props: PageProps<"/quiz/[quizId]">) {
  const { quizId } = await props.params;
  return <QuizLaunch quizId={quizId} />;
}
