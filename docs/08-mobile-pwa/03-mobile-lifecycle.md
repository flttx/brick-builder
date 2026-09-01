# 移动端生命周期

`visibilitychange:hidden` 时立即：saveLocal、pause physics、pause continuous render、suspend audio。

`pagehide` 再做轻量本地 flush。BFCache `pageshow` 时检查 renderer/session/save state 后恢复。

第一版可以支持已有作品离线继续编辑，但不必支持完全离线新建 Project。
