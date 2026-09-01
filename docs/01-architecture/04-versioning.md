# 版本体系

项目中必须区分：

- `appVersion`：Web 应用版本
- `assetPackVersion`：零件资产包版本
- `snapshotVersion`：Brick Engine Snapshot 数据版本
- `pipelineVersion`：资产转换管线版本
- `PartDefinition.version`：单个零件元数据版本

不要统一叫 `version`。

ProjectFile metadata 应保存 appVersion、assetPackVersion；Snapshot 自己保存 snapshotVersion。旧数据通过纯函数 Migration Pipeline 升级。
