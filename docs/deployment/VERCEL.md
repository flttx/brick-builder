# Vercel 部署指南

## Architecture

V1.1 保持现有 Brick Engine、Renderer、Editor、Persistence、Auth、PWA 与 Asset Pipeline 不变，只增加部署适配层：

```text
Vite/React SPA              → Vercel Static CDN
/api/[...path].ts           → Vercel Node.js Function
server/http/api-handler.ts  → 共享请求处理器
server/http/node-adapter.ts → 本地 Node HTTP 适配器
Neon/兼容 PostgreSQL        → pg Pool
R2/AWS S3/MinIO             → 私有缩略图存储
```

本地 `npm run api` 与 Vercel Function 使用同一个 `handleApiRequest`，Function 内不调用 `listen()`。根目录是 Vercel Project Root；不要把 `apps/web` 单独设为 Root Directory，因为 API 与 shared packages 位于仓库根目录。

## Prerequisites

- Node.js 22
- npm 与仓库中的 `package-lock.json`
- Neon 或其他兼容 PostgreSQL 服务
- S3-compatible 私有 Bucket（推荐 Cloudflare R2）
- Vercel Project 连接到该 Git 仓库

## Neon setup

1. 创建 Neon Project 和数据库。
2. 复制 Neon 提供的 pooled connection string，作为 `DATABASE_URL`。不要把密码写入仓库或文档。
3. 在部署前或独立 release job 中执行 migration：

   ```bash
   DATABASE_URL="<pooled-connection-string>" npm run db:migrate
   ```

4. 不要让 Vercel Function cold start 自动执行 migration。

## R2 / S3 setup

创建私有 Bucket，并准备对应的 S3 API endpoint、访问密钥和区域：

```text
S3_ENDPOINT
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_REGION                  # 未设置时默认为 us-east-1
S3_FORCE_PATH_STYLE        # true/false，默认 true
```

缩略图通过 `/media/thumbnails/:projectId.webp` 读取，但响应始终先经过 API 的登录和 Project ownership 检查；不要把 Bucket 设为公开，也不要在客户端暴露 S3 凭据。若 Bucket 有跨域限制，只允许正式站点和当前 Preview 站点的必要来源。

## Vercel project setup

在 Vercel 中导入仓库，使用以下设置：

```text
Root Directory:      .
Install Command:     npm ci
Build Command:       npm run build
Output Directory:    dist-web
Node.js Runtime:     22.x
```

仓库中的 `vercel.json` 已声明 `dist-web`、Node.js 22 Function、`/media` 到 API 的 rewrite、SPA 路由 rewrite，以及 API/静态资产缓存策略。`/api/*` 不会走 SPA fallback；`/assets/*` 继续从 `apps/web/public/assets` 随 Web Build 发布。

## 手动部署前检查清单

在 Vercel 控制台点击 Deploy 前，确认：

- [ ] Git 仓库已包含 `vercel.json`、`api/[...path].ts` 和 `.env.example`。
- [ ] Root Directory 为仓库根目录 `.`，没有单独设置为 `apps/web`。
- [ ] Install Command 为 `npm ci`，Build Command 为 `npm run build`，Output Directory 为 `dist-web`。
- [ ] Node.js 版本为 22.x。
- [ ] Neon 数据库已创建，并准备好 pooled `DATABASE_URL`。
- [ ] 目标数据库已执行 `npm run db:migrate`，且 migration 成功。
- [ ] 私有 S3-compatible Bucket 已创建，缩略图所需的 S3 凭据可用。
- [ ] Preview 和 Production scope 的变量已分别配置；Production 使用正式 HTTPS `APP_ORIGIN`。
- [ ] 没有把真实数据库密码、Session Secret 或 S3 Secret 提交到仓库。

`.env.example` 只用于本地配置参考；Vercel 的真实值请在 Project Settings → Environment Variables 中按 scope 添加。部署前不需要安装或登录 Vercel CLI。

## Environment variables

分别在 Vercel Development、Preview、Production scope 配置，不要提交值：

| 变量 | Development | Preview | Production |
| --- | --- | --- | --- |
| `DATABASE_URL` | 本地/开发库 | Neon pooled URL | Neon pooled URL |
| `SESSION_SECRET` | 至少 32 字符 | 独立 Secret | 独立 Secret |
| `APP_ORIGIN` | `http://127.0.0.1:5173` | 项目正式 Origin 或当前 Preview Origin | 正式 HTTPS Origin |
| `THUMBNAIL_STORAGE_DRIVER` | `local` | `s3` | `s3` |
| `S3_ENDPOINT` | 可省略 | 必填 | 必填 |
| `S3_BUCKET` | 可省略 | 必填 | 必填 |
| `S3_ACCESS_KEY_ID` | 可省略 | 必填 | 必填 |
| `S3_SECRET_ACCESS_KEY` | 可省略 | 必填 | 必填 |
| `S3_REGION` | 可省略 | 按 Bucket 配置 | 按 Bucket 配置 |
| `S3_FORCE_PATH_STYLE` | 可省略 | 按服务配置 | 按服务配置 |

生产环境拒绝默认或短 `SESSION_SECRET`、缺失 `APP_ORIGIN`、关闭 SSL 的 `DATABASE_URL` 和本地文件缩略图存储。Preview 使用 Vercel 注入的 `VERCEL_ENV=preview` 与当前 `VERCEL_URL`，只额外允许当前 deployment origin，不会放行任意 `*.vercel.app`。

## Database migration and deploy

推荐顺序：

```text
配置 Neon / S3
→ npm run db:migrate
→ git push，触发 Vercel Preview
→ Preview smoke
→ Promote 到 Production
→ Production smoke
```

Migration 是独立 release step；CLI 完成后会关闭共享 Pool，HTTP Function 请求完成时不会关闭 Pool。

## Preview deployment

首次 Preview 至少检查：

```bash
BASE_URL="https://<preview-url>" npm run smoke:production
```

该命令检查 `/api/health`、`/api/readiness`、App shell、manifest 和 parts index。只有明确提供 `TEST_EMAIL` 与 `TEST_PASSWORD` 时，才会额外检查 login、session 和 projects；它不会自动创建生产用户。

浏览器验收还应刷新以下地址，确认返回 App shell 而不是 404：

```text
/my-builds
/projects/<project-id>
/assets
/authoring
```

然后完成 register、login、session、new project、save project、thumbnail、reload 和 logout 流程。

## Production deploy

1. 确认 Production scope 的环境变量已配置，尤其是 `APP_ORIGIN`、`SESSION_SECRET`、`DATABASE_URL` 和 S3 凭据。
2. 确认 migration 已针对目标数据库成功执行。
3. 从经过 Preview 验收的提交部署或 Promote。
4. 执行 `BASE_URL="https://<production-domain>" npm run smoke:production`。
5. 使用测试账号（如已配置）验证登录和作品读写；不要在 smoke 中创建未知的真实账号。

## Rollback

优先在 Vercel 将 Production 回滚到最近一个已通过 smoke 的 Deployment。数据库 migration 向前兼容时再回滚应用；不要把 migration 当作每次 Function 启动动作，也不要直接删除线上数据。若 storage/schema 有不兼容变更，先恢复兼容版本，再按项目 migration 策略处理。

## Known limitations

- 本地 `THUMBNAIL_STORAGE_DRIVER=local` 只适合开发；Vercel 运行环境不提供持久本地文件存储。
- 未配置 `TEST_EMAIL` 与 `TEST_PASSWORD` 时，production smoke 会跳过 Auth 流程。
- 本地 adapter 和静态配置测试不能替代真实 Vercel Preview/Production、Neon 或 S3 网络验证；远程验证必须在实际部署后记录。
- `vercel dev` 是可选的本地平台模拟，不是本地开发的前置条件；正常本地开发继续使用 `npm run dev` 与 `npm run api`。
