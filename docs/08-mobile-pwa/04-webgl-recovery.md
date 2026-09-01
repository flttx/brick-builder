# WebGL Context Recovery

监听 WebGL Context Lost。因为 Brick Engine 与 Renderer 分离，Context Lost 不影响 Project Logical State。

恢复流程：saveLocal → destroy/recreate Renderer → reload Geometry Registry → rebuild batches → restore Camera → continue。

恢复失败时告诉用户“3D 场景暂时无法恢复，作品已保存在本地”，而不是展示底层 WebGL 异常字符串。
