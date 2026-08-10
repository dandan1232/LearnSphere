import { AiSettingsForm } from "@/components/ai-settings-form";

export const metadata = { title: "模型设置" };

export default async function SettingsPage(props: PageProps<"/settings">) {
  const searchParams = await props.searchParams;
  const rawSource = searchParams.source;
  const returnSourceId = Array.isArray(rawSource) ? rawSource[0] : rawSource;
  const rawAttempt = searchParams.attempt;
  const returnAttemptId = Array.isArray(rawAttempt) ? rawAttempt[0] : rawAttempt;

  return (
    <div className="settings-layout">
      <header className="settings-heading">
        <p className="section-kicker">YOUR MODEL</p>
        <h1>把钥匙留在自己手里。</h1>
        <p>LearnSphere 兼容采用 Chat Completions 协议的模型服务。Key 仅随调用传递，不写入服务器。</p>
      </header>
      <aside className="settings-privacy" aria-label="API Key 隐私说明">
        <strong>服务器不保存</strong>
        <span>默认关闭浏览器即清除</span>
        <span>支持随时替换模型</span>
      </aside>
      <AiSettingsForm returnSourceId={returnSourceId ?? ""} returnAttemptId={returnAttemptId ?? ""} />
    </div>
  );
}
