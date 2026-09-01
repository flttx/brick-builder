# Deployment

第一版推荐：Next.js Container + Managed PostgreSQL + S3-compatible Storage/CDN。

环境至少 development / staging / production，DB 与 Storage 隔离。

环境变量启动时 schema validate，缺关键配置直接 fail fast。

部署后 smoke：`/`、`/api/health`、登录、创建临时 Project、Asset Index 与核心 Part 加载。
