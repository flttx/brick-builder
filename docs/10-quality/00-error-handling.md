# Error Handling

统一 AppError：category、severity、recoverable、code、userMessage、cause/context。

优先级：自动恢复 → 降级运行 → 提示用户 → 最后阻断。

Asset 单点失败使用 Missing Part Proxy；Cloud Save 失败但 Local Draft 成功时允许继续；Auth 过期时先保存 Local Draft，再要求重新登录。

Snap/Collision 的“放不下”属于正常业务状态，不进入 AppError/Telemetry。
