import { AttemptPlayer } from "@/components/attempt-player";

export const metadata = { title: "正在答题" };

export default async function AttemptPage(props: PageProps<"/attempt/[attemptId]">) {
  const { attemptId } = await props.params;
  return <AttemptPlayer attemptId={attemptId} />;
}
