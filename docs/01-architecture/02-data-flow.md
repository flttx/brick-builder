# 关键数据流

## Drag + Snap

Pointer → Interaction Controller → Free Transform → BrickEngine.updateDrag() → SnapCandidate/CollisionResult → Renderer Visual Interpolation → PointerUp → BrickEngine.commitDrag() → Command → Engine Event → Renderer/Feedback。

## 保存

CommandCommitted → SaveManager.markDirty() → Local Draft → debounce Cloud Save → Backend optimistic lock → server revision → Cached Snapshot 更新。

## 新砖放置

Bucket / Part Browser / Duplicate → NewBrickPlacementSession → Placement Proxy → Engine Evaluate → Commit → AddPlacedBrickCommand。

## 打开作品

Project Metadata + Cloud Snapshot + Local Draft → Recovery Resolution → Asset Metadata → Engine loadSnapshot → rebuild Spatial/Graph/Occupancy → Renderer batches → Camera Fit。
