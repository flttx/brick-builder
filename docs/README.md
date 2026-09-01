# Brick Builder 设计文档

这套文档描述一个在线数字积木拼搭产品的产品、核心引擎、渲染、资产、编辑器、持久化、后端、PWA、性能、测试与交付架构。

## 阅读顺序

1. `00-product/00-product-overview.md`
2. `01-architecture/00-system-architecture.md`
3. `01-architecture/01-module-boundaries.md`
4. `02-brick-engine/00-engine-overview.md`
5. 按当前开发阶段阅读对应专题
6. Codex 开发时额外阅读 `12-development/`

## 核心原则

- Brick Engine 是项目逻辑真相源。
- Three.js/R3F 只负责渲染，不决定连接是否合法。
- React/Zustand 只保存低频 UI/编辑器状态，不保存每帧拖拽状态。
- Rapier 只用于装饰性物理，不负责核心积木连接。
- Visual Geometry、Collision Geometry、Connection Geometry 三者分离。
- 先验证两块 2×4 Brick 的拼搭手感，再扩产品外围。
