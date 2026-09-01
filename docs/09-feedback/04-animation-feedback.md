# 动画反馈

逻辑 Commit 与视觉动画分离：Engine 立即完成连接，Renderer 再执行 press/rebound。

Detach 在阈值前有视觉阻力，未超过阈值松手时弹回；超过阈值后 pop 并完全跟手。

Rotate、Delete、Undo/Redo 可做短过渡，但动画不会影响真实 Transform/History。
