# Project API

概念 API：

- GET/POST `/api/projects`
- GET/PATCH/DELETE `/api/projects/:id`
- PUT `/api/projects/:id/document`
- POST `/api/projects/:id/duplicate`

Save 流程：Auth → Ownership → Schema Validation → Size Limit → Optimistic Lock → Transaction → Response。

Project List 不返回完整 Snapshot。
