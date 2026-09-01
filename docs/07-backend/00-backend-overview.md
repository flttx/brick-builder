# Backend 总览

推荐 MVP：Next.js + PostgreSQL + Drizzle/Prisma + S3-compatible Object Storage。

后端只负责身份、Project Metadata、Snapshot、Preferences、Thumbnail、权限和持久化，不参与每帧 Snap/Collision。

第一版采用单体，不引入 Kafka、微服务或复杂队列。
