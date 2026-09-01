# 视觉反馈

Snap 分三级：Near、Candidate、Locked。

Renderer 可在 freeTransform 与 snapTransform 之间进行 smooth interpolation，Engine 仍保留精确逻辑 Transform。

合法 Commit 后：短促下压 0.025~0.05 BU，再轻微回弹，约 100~160ms。

Invalid Placement 不建议整砖变红，而使用克制红色 Outline/碰撞提示。

Detach 先有短阻力，超过阈值后 pop 并恢复正常跟手。
