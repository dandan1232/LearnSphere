# LearnSphere

LearnSphere 是一个本地优先的 AI 主动回忆学习工具：粘贴公开技术文档或在线书籍链接，选择章节，生成混合题型测验，并在答题后获得可追溯的评分、原文证据和上下文 AI 讲解。

## 已实现能力

- 解析 Docsify、VitePress、GitHub Markdown、通用技术文档与文章。
- 自动发现目录并支持一次选择 1–8 个章节。
- 使用用户自己的 OpenAI Chat Completions 兼容模型生成单选、多选、判断和简答题。
- 题目绑定原文片段；模型输出经过题型、答案、重复项、出处和总分校验。
- 客观题确定性计分，多选题支持带错选惩罚的部分分；简答题按 rubric 逐项给分并解释原因。
- 答案、题库、成绩和 AI 对话保存在浏览器 IndexedDB；无需注册账号。
- 作答中 AI 导师只给提示，不接收正确答案；出分后可直接追问“为什么选 A”。
- 按场次状态、得分情况、题型、章节位置和知识标签筛选复盘记录。
- 亮色/深色主题、响应式布局、键盘焦点和减少动态效果支持。

## 隐私与安全边界

- API Key 默认写入 `sessionStorage`，关闭浏览器会话后清除；用户可主动选择记住在当前设备。
- API Key 仅在调用模型时经过 LearnSphere 服务端转发，不写入数据库、日志或项目文件。
- 服务端仅允许 HTTPS 模型接口，并对目标域名做 DNS 与内网地址校验，降低 SSRF 风险。
- 导入链接、模型地址和重定向都会阻止 localhost、私网、链路本地及保留地址。
- API 设有请求体上限和进程内访问频率限制；公开部署应只让 Next.js 监听 `127.0.0.1`，由 Nginx 暴露 80/443。
- 学习数据存在浏览器中，清除站点数据会删除本地记录。第一版不提供跨设备同步。

## 本地运行

要求 Node.js 20.9 或更高版本。

```bash
npm ci
npm run dev
```

打开 `http://localhost:3000`。进入“模型设置”后填写：

1. HTTPS Base URL，例如 `https://api.openai.com/v1`。
2. 供应商提供的模型 ID。
3. API Key。

应用兼容标准的 `/chat/completions` 响应结构。第三方兼容服务如果使用不同字段或只支持 Responses API，当前版本无法直接调用。

## 验证与构建

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

也可以一次执行完整门禁：

```bash
npm run verify
```

## 生产部署

仓库提供了 Ubuntu + systemd + Nginx 的部署基线：

- `deploy/learnsphere.service`：让应用以 `ubuntu` 用户在 `127.0.0.1:3000` 运行。
- `deploy/nginx-http.conf`：Nginx 反向代理与证书签发前的 HTTP 配置。
- `deploy/deploy.sh`：拉取 `main`、安装锁定依赖、执行完整验证并重启服务。

首次部署示例：

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx git
git clone https://github.com/dandan1232/LearnSphere.git /home/ubuntu/learn-sphere
cd /home/ubuntu/learn-sphere
npm ci
npm run verify
sudo cp deploy/learnsphere.service /etc/systemd/system/learnsphere.service
sudo cp deploy/nginx-http.conf /etc/nginx/sites-available/learnsphere
sudo ln -s /etc/nginx/sites-available/learnsphere /etc/nginx/sites-enabled/learnsphere
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable --now learnsphere nginx
sudo certbot --nginx -d learnsphere.nianan.ggff.net --redirect
```

后续发布：

```bash
cd /home/ubuntu/learn-sphere
./deploy/deploy.sh
```

如果域名经过 Cloudflare 代理，证书签发后将 SSL/TLS 模式设为 Full (strict)。不要把服务器密码、API Key 或 Cloudflare 凭据提交到仓库。

## 技术栈

- Next.js 16、React 19、TypeScript
- Zod 运行时契约
- IndexedDB + idb
- Vitest + Testing Library
- Undici 安全出站请求

## License

[MIT](./LICENSE) © 念安 / dandan1232
