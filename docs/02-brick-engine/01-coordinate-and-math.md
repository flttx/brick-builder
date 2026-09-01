# 坐标系与数学约定

## 坐标

- Y Up
- X 左右
- Z 前后
- 1 Stud = 1 BU
- 1 Plate = 0.4 BU
- 1 Brick = 1.2 BU

为未来 Jumper/Offset/Technic 保留 0.5 Stud 水平步长。

## Rotation

内部统一 Quaternion，不用 Euler 作为真相源。V1 标准 Brick 只允许 Y 轴 0/90/180/270°。

```ts
interface Vec3 { x:number; y:number; z:number }
interface Quat { x:number; y:number; z:number; w:number }
interface Transform { position:Vec3; rotation:Quat }
```

Engine Math 不依赖 THREE.Vector3/Quaternion；Renderer 使用 adapter 转换。
