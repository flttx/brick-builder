# 用户体验设计

## 核心心智

用户的心理动作是“再拿一块积木”，而不是“创建一个 Mesh”。

## 真实感来源

真实感不是依赖复杂刚体模拟，而是多个细节叠加：

- 轻微塑料高光与倒角
- 接触阴影
- 抓取点保持，不让 Brick 瞬移到中心
- Snap 三级反馈：near / candidate / locked
- 磁吸插值
- Commit 后短促按压和回弹
- Detach 前阻力与 pop
- 克制的塑料 click / rattle 音效

## 桌面交互

- 空白拖动：Orbit
- 点击 Brick：Select
- 按住 Brick 并移动超过阈值：Drag
- Wheel：Zoom
- R：旋转 90°
- Esc：取消当前 Placement/Drag
- Ctrl/Cmd+Z：Undo
- Ctrl/Cmd+Shift+Z：Redo

## 移动端

- 单指空白：Orbit
- 单指 Brick：Select/Drag
- 双指：Pan + Pinch Zoom
- 第二根手指出现时取消正在进行的 Brick Drag，切到 Camera Gesture
- Rotate 使用显式按钮，不依赖双指旋转 Brick
