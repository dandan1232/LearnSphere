import { SourceImporter } from "@/components/source-importer";

export const metadata = { title: "选择学习范围" };

export default async function NewStudyPage(props: PageProps<"/learn/new">) {
  const parameters = await props.searchParams;
  const rawUrl = parameters.url;
  const initialUrl = Array.isArray(rawUrl) ? rawUrl[0] : rawUrl;

  return <SourceImporter initialUrl={initialUrl ?? ""} />;
}
