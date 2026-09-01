# 新 Brick 放置

无论来源是 Bucket、Browser、Recent、Duplicate，统一进入 `NewBrickPlacementSession`。

在 Commit 前只创建 Placement Proxy，不提前加入 BrickStore。Commit 后执行 `AddPlacedBrickCommand`，一次完成 Brick 创建、Transform 和 Connections。

Cancel 不进入 History。
