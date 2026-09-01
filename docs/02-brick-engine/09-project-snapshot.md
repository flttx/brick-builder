# Project Snapshot 与一致性

```ts
interface BrickProjectSnapshot {
  version:1;
  bricks:Array<{
    id:string;
    partId:string;
    colorId:string;
    position:[number,number,number];
    rotation:[number,number,number,number];
  }>;
  connections:Array<{
    id:string;
    brickA:string;
    brickB:string;
    pairs:Array<[string,string]>;
  }>;
}
```

不保存 Spatial Hash、AABB、World Connector、Selection、Hover、Dirty Cache 等运行时数据。

加载时：BrickStore → Spatial Index → Graph → Occupancy → consistency validation。

开发环境提供 `validateEngineConsistency()`，检查 Brick/Connector 引用、Graph/Occupancy、重复占用和 Spatial 引用。
