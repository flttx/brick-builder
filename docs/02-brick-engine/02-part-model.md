# Part 与 Brick 数据模型

`PartDefinition` 表示静态共享定义，`BrickInstance` 表示作品中的实例。

```ts
interface PartDefinition {
  id:string;
  version:number;
  name:string;
  category:"brick"|"plate"|"tile"|"slope"|"technic"|"special";
  dimensions:{width:number;height:number;depth:number};
  asset:{glb:string};
  connectors:ConnectorDefinition[];
  colliders:ColliderDefinition[];
  origin:Vec3;
}
```

```ts
interface BrickInstance {
  id:string;
  partId:string;
  colorId:string;
  transform:Transform;
  locked?:boolean;
  visible?:boolean;
}
```

不要在 BrickInstance 持久化 world connector、AABB、Mesh、Spatial Cell 等派生运行时数据。
