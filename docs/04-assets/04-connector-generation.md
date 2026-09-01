# Connector 自动生成

标准矩形 Brick/Plate/Tile 使用 `createRectPart` 规则生成 Connector Grid。

- Brick/Plate：top Stud + bottom AntiStud
- Tile：bottom AntiStud，无 top Stud

复杂零件使用 Manual Metadata + 可视化 Part Authoring Tool 校正。不要长期依赖人工手敲大量三维坐标。
