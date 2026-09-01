# Picking 与 Render Proxy

Raycaster 只针对可拾取 Brick Batches，不扫描 Ground Helper、灯光、Debug Object 等无关对象。

InstancedMesh 命中后使用 instanceId → BrickId 映射。

Transient Proxy：

- SelectionProxy：选中轮廓
- HoverProxy：轻量 hover
- DragProxy：当前拖动 Brick
- SnapIndicator：附近 Connector/锁定状态

Proxy 不进入 Project Snapshot。
