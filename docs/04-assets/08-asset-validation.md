# 资产质量门禁

进入 Runtime Asset Pack 前必须通过：

- ID 唯一
- Geometry/LOD 存在
- Origin/Bounds 合法
- Collider 存在
- Connector ID 唯一且类型注册
- Connector 数量符合标准模板
- 无 NaN/Infinity
- Thumbnail 生成成功
- 标准 Brick 自动 Snap Smoke Test PASS

任何核心验证失败，资产发布应直接失败。
