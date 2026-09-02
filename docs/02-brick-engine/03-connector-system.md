# Connector System

## Connector 类型

```ts
type ConnectorType =
 | "stud" | "anti_stud" | "tube"
 | "technic_pin" | "technic_hole"
 | "axle" | "axle_hole" | "bar" | "clip";
```

连接识别器支持上述全部类型；LDraw 零件中的 stud、Technic 孔、车轴孔、杆/夹等连接原语会转换为 Gameplay Connection Geometry。

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
