# Interaction State Machine

核心状态：Idle、Hovering、Pressed、DraggingBrick、OrbitingCamera、PanningCamera、PinchingCamera、ExplicitConnectorSelect、Disabled。

PointerDown 先 Pick：命中 Brick 则 Brick Gesture 获得控制；命中空白则 Camera Gesture 获得控制。

使用 Pointer Capture，Click 与 Drag 使用不同阈值。桌面可约 5~6px，触摸约 10~14px。

Drag 记录 Grab Point/Grab Offset，避免开始拖动时 Brick 中心跳到鼠标位置。
