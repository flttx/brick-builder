# Camera System

CameraController 封装 Orbit、Pan、Zoom、Focus、Fit、Reset、Enable/Disable。

Camera 维护 `target`，Orbit 围绕 target，而不是永久围绕世界原点。双击 Brick 可将 target 平滑过渡到 Brick Center。

Zoom 修改 Camera Distance，不通过不停改变 FOV。

Camera Focus/Fit 采用短过渡，尊重 `prefers-reduced-motion`。
