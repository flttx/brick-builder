# Snap Solver

Snap Solver 只计算“最佳合法落点候选”，不直接修改项目。

```ts
interface SnapRequest {
  movingBrickId:string;
  freeTransform:Transform;
  pointerWorld?:Vec3;
  cameraDirection?:Vec3;
  previousCandidate?:SnapCandidate;
  mode:"auto"|"explicit_connector"|"disabled";
}
```

流程：

Free Transform → Moving World Connectors → Spatial Query → Compatibility → Anchor Pair → Target Transform → Rotation Quantization → Multi-Connector Match → Candidate Dedup → Broad Collision → Score → Narrow Collision Top-N → Hysteresis → Best Candidate。

评分综合 distance、pointer intent、rotation、matchedPairs、stability。不能简单选择最近 Connector，也不能只最大化连接点数量。

建议初始参数：

- mouse detect 0.55 / enter 0.30 / exit 0.42 BU
- touch detect 0.70 / enter 0.40 / exit 0.55 BU
- strong lock ~0.18 BU
- match position epsilon ~0.03 BU
- match angle ~2°

这些是手感参数，不是物理常数。
