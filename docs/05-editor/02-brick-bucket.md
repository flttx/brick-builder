# Brick Bucket

Brick Bucket 是产品标志性体验。随机逻辑与物理动画分离：RNG 决定 Part，动画只负责表现。

```ts
interface BrickBucketPool {
  id:string;
  allowedPartIds?:string[];
  allowedCategories?:string[];
  excludedPartIds?:string[];
  weights?:Record<string,number>;
  allowedColorIds?:string[];
  seedMode:"random"|"seeded";
}
```

基础 Brick 权重更高，特殊件权重低。支持 seeded random，为 Challenge、Replay、测试保留确定性。
