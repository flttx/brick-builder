# 多设备冲突

保存采用 Optimistic Concurrency：baseServerRevision 必须等于 current server revision，否则返回 409。

MVP 不做自动 Merge，冲突时提供：载入服务器版本 / 保存当前版本为副本。

绝不能静默覆盖其他设备已经保存的作品。
