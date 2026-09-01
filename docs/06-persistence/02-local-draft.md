# Local Draft 与 Cached Snapshot

大型作品本地恢复使用 IndexedDB，不用 localStorage 保存 Snapshot。

区分：

- CachedProjectSnapshot：服务器已确认版本，用于离线打开
- LocalProjectDraft：本地未完全同步修改，用于 Crash Recovery

Cloud Save 成功后更新 Cached Snapshot，Draft 已完全同步时清理。
