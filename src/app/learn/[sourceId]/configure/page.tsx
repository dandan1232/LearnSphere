import { QuizConfigurator } from "@/components/quiz-configurator";

export const metadata = { title: "设置测验" };

export default async function ConfigureQuizPage(props: PageProps<"/learn/[sourceId]/configure">) {
  const { sourceId } = await props.params;
  return <QuizConfigurator sourceId={sourceId} />;
}
