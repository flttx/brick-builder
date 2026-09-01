# Connector System

## Connector 类型

```ts
type ConnectorType =
 | "stud" | "anti_stud" | "tube"
 | "technic_pin" | "technic_hole"
 | "axle" | "axle_hole" | "bar" | "clip";
```

V1 只实现 `stud` 和 `anti_stud`。

```ts
interface ConnectorDefinition {
  id:string;
  type:ConnectorType;
  role:"plug"|"socket"|"neutral";
  position:Vec3;
  rotation:Quat;
  normal:Vec3;
  compatibilityGroup:string;
  snapRadius:number;
  occupiedRule:"single"|"multi";
}
```

Compatibility 由中央 `CompatibilityRegistry` 决定，不把所有关系硬编码成 male/female。

底部连接点是 Gameplay Connection Geometry，可使用规则化 AntiStud Grid，不要求与视觉底部几何一一对应。
