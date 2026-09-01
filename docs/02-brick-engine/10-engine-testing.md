# Brick Engine 测试要求

核心测试围绕规则行为，不以代码覆盖率代替质量。

必须覆盖：

- 1×1 stack = 1 pair
- 2×4 full stack = 8 pairs
- partial offset
- wrong connector direction
- occupied connector
- candidate hysteresis
- collision with third brick
- duplicate transform dedup
- connect/disconnect/connected component
- execute/undo/redo round trip
- snapshot serialize/load round trip
- consistency validator failure cases

建议使用固定 fixtures 与 seed，输出 P50/P95/P99 Snap/Collision benchmark。
