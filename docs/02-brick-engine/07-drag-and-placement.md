# Drag 与 Placement 生命周期

## Drag Session

```ts
interface DragSession {
  brickId:string;
  startTransform:Transform;
  currentTransform:Transform;
  snapCandidate?:SnapCandidate;
  mode:"free"|"snap";
}
```

生命周期：beginDrag → updateDrag → commitDrag / cancelDrag。

已连接 Brick 不在 pointerdown 时立即断开，而是进入 PendingDetach，移动超过屏幕/世界阈值后才 detach。

Detach 时记录原 Transform 与 removed ConnectionGroups；Cancel 时完整恢复。

新 Brick 在正式放置前使用 Placement Proxy，不提前进入 BrickStore；Commit 时通过 `AddPlacedBrickCommand` 一次创建 Brick + Connection。
