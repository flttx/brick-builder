# Performance Architecture

规模分级：Small ≤500、Medium 500~2000、Large 2000~5000，5000+ 作为后续专项。

性能重点：Object3D/Draw Call/React 更新/Spatial Query/GC/GPU Resource Lifecycle，而不是只看三角形数量。

Engine Snap 应保持 O(local connectors)，Collision 保持 O(local bricks)。移动 Brick 暂时从静态 Spatial Index 移除，Commit 再插入。

Command History、Asset Cache、GPU Geometry 都必须有清理策略。
