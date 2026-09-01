# 移动端手势

- 单指按空白：Orbit
- 单指按 Brick：Select，超过阈值后 Drag
- 双指：Camera Pan + Pinch Zoom
- 正在 Drag 时第二 pointer 出现：取消 Drag 并恢复，进入 Camera Gesture
- Rotate 使用显式按钮

Canvas 使用 `touch-action: none`；外围页面区域保持正常滚动。移动端无 Hover 概念。

iPad 分屏下宽度不足时，固定 Part Drawer 自动降级为 Bottom Sheet。
