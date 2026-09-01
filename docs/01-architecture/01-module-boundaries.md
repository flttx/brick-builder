# 模块边界

## Brick Engine 禁止依赖

React、Next.js、R3F、Three.js、Rapier、Zustand、DOM、fetch、数据库。

Brick Engine 应为纯 TypeScript Domain Engine，可在单测、Worker、服务端验证环境复用。

## Renderer 不负责

- Connector Compatibility
- Snap 决策
- Collision 合法性
- ConnectionGraph
- 项目持久化

## React/Zustand 不负责

- 每帧 Brick Transform
- Pointer 高频坐标
- Camera Velocity
- Snap Candidate 原始计算
- Drag 的 per-frame 业务更新

## Rapier 不负责

- 核心连接
- 最终 Transform
- 编辑模式碰撞合法性

## 三类几何必须分离

Visual Geometry ≠ Collision Geometry ≠ Connection Geometry。
