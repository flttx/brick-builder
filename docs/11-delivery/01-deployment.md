# Deployment

V1.1 推荐：Vite/React SPA 部署到 Vercel Static CDN，Node.js Function 提供 API，Neon 或其他兼容 PostgreSQL 提供数据库，S3-compatible Storage 保存私有项目缩略图。

部署适配细节、环境变量、migration、Preview 与 smoke 流程见 `docs/deployment/VERCEL.md`。

环境至少 development / staging / production，DB 与 Storage 隔离。

环境变量启动时 schema validate，缺关键配置直接 fail fast。

部署后 smoke：`/`、`/api/health`、登录、创建临时 Project、Asset Index 与核心 Part 加载。
