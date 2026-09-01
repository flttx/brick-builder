# Connection Graph 与 Occupancy

一个 Brick 对 Brick 的多 Stud 连接使用单个 `ConnectionGroup`：

```ts
interface ConnectionGroup {
  id:string;
  brickA:string;
  brickB:string;
  type:"rigid"|"hinge"|"axle"|"ball";
  pairs:Array<{connectorA:string;connectorB:string}>;
}
```

V1 仅 `rigid`。

Graph 保存 Brick 间逻辑关系；OccupancyIndex 按 ConnectorKey 记录某个 Connector 被哪个 ConnectionGroup 占用。

连接与断开必须由 `ConnectionManager` 事务式协调 Graph + Occupancy，避免两者不一致。

Ground 是 Placement Constraint，不进入 ConnectionGraph，否则所有放在桌上的散砖会成为一个 Connected Component。
