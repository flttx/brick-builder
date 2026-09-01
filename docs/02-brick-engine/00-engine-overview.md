# Brick Engine 总览

Brick Engine 是整个产品最重要的领域核心，负责：

1. Part Definition
2. Brick Instance
3. Connector
4. Snap Solver
5. Collision Validation
6. Connection Graph
7. Connector Occupancy
8. Drag Lifecycle
9. Command / Undo / Redo
10. Snapshot / Consistency

推荐内部结构：

```text
Part Registry
   ↓
Brick Store
   ↓
Connector System ── Spatial Index
   ↓
Snap Solver
   ↓
Placement Validator ── Collision Solver
   ↓
Connection Manager
   ↓
Command History
```

Engine 不负责 Renderer、Audio、数据库或 HTTP。
