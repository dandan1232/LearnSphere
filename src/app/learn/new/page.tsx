interface NewStudyPageProps {
  searchParams: Promise<{ url?: string | string[] }>;
}

export const metadata = { title: "创建测验" };

export default async function NewStudyPage({ searchParams }: NewStudyPageProps) {
  const parameters = await searchParams;
  const sourceUrl = Array.isArray(parameters.url) ? parameters.url[0] : parameters.url;

  return (
    <section className="placeholder-page">
      <p className="section-kicker">NEW QUIZ</p>
      <h1>创建测验</h1>
      <p className="break-anywhere">
        {sourceUrl ? `准备解析：${sourceUrl}` : "先从首页粘贴一个公开技术文档链接。"}
      </p>
      <p>文档解析器将在下一个交付增量接入。</p>
    </section>
  );
}
