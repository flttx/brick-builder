# 后端安全

所有 Project API 都必须按当前 userId 做 ownership 检查；跨用户访问建议返回 404 减少信息泄漏。

检查 Snapshot body size、Brick 数量、ID 长度、Schema、未知值和 NaN/Infinity。生产配置 CSP、X-Content-Type-Options、Referrer-Policy、Permissions-Policy。

日志禁止记录密码、Session Token、完整 Project Snapshot。
