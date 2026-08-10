import { AttemptResults } from "@/components/attempt-results";

export const metadata = { title: "测验成绩" };

export default async function AttemptResultsPage(props: PageProps<"/attempt/[attemptId]/results">) {
  const { attemptId } = await props.params;
  return <AttemptResults attemptId={attemptId} />;
}
