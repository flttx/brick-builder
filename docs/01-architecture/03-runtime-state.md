# 运行时状态管理

状态划分为三类：

### Product State
由 Brick Engine 持有：Bricks、Connections、Colors、Snapshot。

### Editor State
由 Zustand/React 持有：selectedBrickId、currentTool、面板开关、Current Color、用户设置。

### Runtime Render State
由 Renderer/Interaction Runtime 持有：hoveredInstance、pointer、current drag matrix、magnet interpolation、camera velocity、临时 Proxy。

高频 Runtime State 不进入 React State，不进入作品 Snapshot。
