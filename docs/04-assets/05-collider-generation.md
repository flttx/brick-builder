# Collider 生成

标准 Brick 自动生成略收缩的 Main Box Collider。

复杂 Part 可从 Bounding Box 起步，再人工拆成 Box/Cylinder/Compound。Convex Hull 只作为辅助，不作为默认运行时碰撞体。

Collider 与 Visual Mesh 独立，不因为 LOD 变化而改变 Gameplay Collision。
