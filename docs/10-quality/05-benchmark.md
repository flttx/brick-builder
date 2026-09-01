# Benchmark

仓库维护固定 seed 的 `benchmark-projects/`：100、500、1000、3000、5000 Brick，至少有 sparse 与 dense 两类。

Engine benchmark 输出 Snap P50/P95/P99、Collision P50/P95、Snapshot serialize/load、Spatial Build。

浏览器 Perf Lab 固定 Camera 自动 orbit，记录 frame P50/P95、draw calls、triangles。移动端必须真机测试。
