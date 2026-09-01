# Project Persistence 模型

分三层：Runtime State → Local Draft → Cloud Project。

Server Project 保存 metadata；ProjectDocument 保存当前 Snapshot。

```ts
interface Project {
 id:string; userId:string; name:string; thumbnailUrl?:string;
 brickCount:number; currentRevision:number;
 createdAt:string; updatedAt:string;
}
```

第一版不永久保存每次 Autosave 的完整历史版本，只保留 Current Snapshot 和必要恢复数据。
