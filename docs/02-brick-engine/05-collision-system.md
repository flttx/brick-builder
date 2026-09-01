# Collision System

## V1 原则

标准 Brick 使用简化 Hard Collider，不直接用完整 GLB Triangle Mesh。

视觉 Stud 初期不进入 Hard Collider，避免正常连接被误判为 penetration。

### Collider

V1 支持 Box，可预留 Cylinder/Compound。标准 Brick 主体 Box 可比视觉尺寸略收缩，避免浮点接触误判。

### Broad Phase

维护独立 `BrickSpatialIndex`，Candidate World AABB 查询附近 Brick，再进入 narrow phase。

### 接触与穿透

区分 separated / touching / penetrating。接触合法，明显 penetration 非法。Epsilon 统一集中配置，禁止业务代码散落 magic number。

复杂斜面、Hinge、自由旋转件后续再增加 OBB/SAT 等算法。
