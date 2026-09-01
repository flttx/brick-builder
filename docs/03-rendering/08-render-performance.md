# Renderer 性能策略

性能目标：桌面 1000 Brick 尽量稳定 60fps；移动端 500 Brick 45~60fps。最终阈值以真实资产 benchmark 为准。

关键策略：

- InstancedMesh
- Dirty Batch
- On-demand Render
- Dynamic DPR
- LOD
- GPU Resource Dispose
- Hover 降频
- Drag 时停止无关 Picking
- 静止时停止连续 Frame Loop

质量等级：High / Balanced / Performance；只降低视觉效果，不降低 Snap/Collision 正确性。
