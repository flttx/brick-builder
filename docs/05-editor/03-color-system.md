# Color System

颜色使用离散 Brick Color Registry，不默认开放任意 RGB。标准不透明 Brick 尽量共享一个材质模型，颜色走 instanceColor。

无 Selection 时选择颜色改变 `currentColorId`；有 Selection 时选择颜色执行 `ChangeColorCommand`。

Bucket 默认随机 Part + Current Color，而不是每次同时随机颜色。
