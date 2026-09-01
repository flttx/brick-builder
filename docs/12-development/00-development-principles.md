# 开发原则

1. 先验证 Engine，再扩产品页面。
2. Three.js Mesh 不是业务数据。
3. PointerMove 不进入 React State。
4. 一个 Drag Gesture 只产生一个 Command。
5. 核心 Engine 行为必须可纯单测。
6. 先正确再优化，但从第一天避免每 Brick 一个 Mesh/Material、全量 Connector 暴力查询等明显错误。
7. Visual / Collision / Connection Geometry 分离。
8. 不为未来能力过度抽象。
9. 未通过当前阶段 Acceptance，不进入下一阶段。
