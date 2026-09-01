# Runtime Asset Registry

AssetRegistry 负责按需加载、预加载、共享 Geometry、引用计数与释放。

打开项目先从 Snapshot 提取 unique partIds，只加载实际使用的资产。常用 Bucket Parts 可以预取。

大场景资源并发建议限制 4~8 个请求。refCount 为 0 后进入 idle cache，再延迟 dispose，避免 Undo/Recent 立刻重新下载。
