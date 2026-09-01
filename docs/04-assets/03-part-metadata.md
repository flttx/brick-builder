# Part Metadata

Runtime Manifest 包含：id、version、name、category、geometry LOD、dimensions、connectors、colliders、source。

标准矩形 Part 使用模板配置生成，不手工填写所有 connector 坐标。

分类只用于 Part Browser；Engine 的连接规则真正依赖 connectors/colliders，而不是 category。
