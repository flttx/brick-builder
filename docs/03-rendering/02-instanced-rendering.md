# Instanced Rendering

按 `partId + materialVariant` 分 RenderBatch，内部维护：

- `brickToInstance`
- `instanceToBrick`
- `freeSlots`

建议 chunk capacity 256/512，避免一个巨大预分配 InstancedMesh。

标准颜色优先走 instanceColor，不为每个颜色创建独立 Material。透明材质作为单独 Rendering Variant。

删除 Brick 后释放 slot，新 Brick 优先复用。大场景后续可升级为 Part + Spatial Sector 分批。
