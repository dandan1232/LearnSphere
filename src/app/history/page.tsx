import Link from "next/link";

export const metadata = { title: "练习记录" };

export default function HistoryPage() {
  return (
    <section className="placeholder-page">
      <p className="section-kicker">HISTORY</p>
      <h1>练习记录</h1>
      <p>完成第一份测验后，你可以在这里筛选错题、章节、题型和知识点。</p>
      <Link className="button button--secondary" href="/">
        创建第一份测验
      </Link>
    </section>
  );
}
