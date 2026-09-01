# Release 与 Rollback

数据库 Migration 优先采用 Expand → Deploy → Contract Later，避免滚动部署时旧实例与新 Schema 互相破坏。

Web Rollback 尽量不依赖数据库立即 rollback。Asset Release 通过 immutable pack + current pointer 独立回滚。

生产重点监控：API 5xx、Cloud Save failure、DB latency、Asset 404、Login failure、frontend fatal、WebGL context lost。
