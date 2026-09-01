# 资产构建管线

推荐构建流程：

Source Resolve → Normalize Coordinate/Scale/Origin → Geometry Cleanup → Normals → Bevel → Gameplay Metadata → Connector → Collider → LOD → Validation → GLB Export → Thumbnail → Manifest → Parts Index。

目标命令：

```text
pnpm assets:build brick-2x4
pnpm assets:build
```

构建支持 sourceHash + metadataHash + pipelineVersion 增量重建。
