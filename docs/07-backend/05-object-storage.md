# Object Storage

Object Storage 用于 Project Thumbnail 与 Runtime Part Assets。

Runtime Assets 是 public immutable static files，路径按 content hash/version 发布并通过 CDN 缓存。

Project Thumbnail 如果作品默认私有，建议 private bucket + signed read 或 authenticated proxy，不能把“UUID 不好猜”当权限控制。
