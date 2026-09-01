# 测试策略

测试分层：

1. Pure Unit
2. Engine Integration
3. Renderer / Interaction
4. Backend Integration
5. Browser E2E
6. Performance / Real Device Acceptance

核心规则必须有行为测试。不要通过给 getter/setter 堆测试来追求虚高覆盖率。

Backend Integration 应使用真实 PostgreSQL Test DB 验证 transaction、constraints、revision conflict、ownership。
