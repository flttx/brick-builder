# 数据库 Schema

核心表：

- users
- sessions
- projects
- project_documents
- user_preferences

`projects` 保存 metadata，`project_documents` 当前版本保存 snapshot JSONB。

不要将每块 Brick 拆成数据库行。Autosave 应以 Document Snapshot 为单位。

所有表使用 FK/UNIQUE/NOT NULL 等数据库约束；时间统一 timestamptz UTC。
