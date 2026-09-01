# Offline Cache

状态数据与静态资源必须分开：

- Project State → IndexedDB
- App Shell / GLB / Manifest / Thumbnail → HTTP/SW Cache

建议策略：App Shell precache；hashed JS/CSS 与 Part GLB cache-first；Parts Index network-first + cache fallback；Project API network-only。

避免同时出现 Cloud Snapshot、IDB Draft、HTTP API Cache、SW API Cache 四套相互冲突的数据源。
