# 资产系统总览

资产管线：Source Asset → Processed Geometry → Gameplay Metadata → Runtime Package。

Runtime 只消费 GLB + JSON，不在 Next.js 运行时动态解析 LDraw。

每个 Part 都必须可追溯 Source、Version、Geometry Hash、Metadata Hash 和 Pipeline Version。
