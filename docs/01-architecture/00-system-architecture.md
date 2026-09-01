# 系统总体架构

## 总体关系

```text
React UI
   │
   ▼
Editor Controller
   ├── Interaction Controller
   ├── Camera Controller
   └── Project Controller
            │
            ▼
        Brick Engine
            │
            ▼
     Renderer Adapter
            │
            ▼
      Three.js / R3F
```

外围系统：

- Asset Registry 为 Renderer 和 Engine 提供 Part Metadata / Geometry。
- Persistence 只消费 Brick Engine Snapshot。
- Backend 保存 Snapshot、Project Metadata、Preferences 和 Thumbnail。
- Feedback 监听 Engine Events，触发动画、Audio 和可选 Haptics。

## 真相源

- Brick Engine：逻辑真相
- Renderer：视觉表示
- Physics：临时视觉运动
- React/Zustand：UI 与粗粒度编辑器状态
- Backend：持久化 Snapshot
