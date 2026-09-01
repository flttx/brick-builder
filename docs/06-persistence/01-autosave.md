# Auto Save

所有作品修改通过 CommandCommitted 标记 Dirty。

建议：Local Draft 约 500ms~1s debounce；Cloud Save 停止修改 2s debounce，同时设约 15s max wait，防止持续操作导致长期不保存。

Save Request 携带 clientRevision 与 baseServerRevision。旧请求返回时只有 currentRevision 等于 savedRevision 才能 clear dirty，避免 race condition。
