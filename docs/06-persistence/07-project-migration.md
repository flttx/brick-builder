# Project Migration

ProjectFile 与 BrickProjectSnapshot 分别拥有 formatVersion / snapshotVersion。

Migration 必须是纯函数，不依赖 UI、DB、Three.js。

旧数据有局部非法时尽可能部分恢复：跳过坏 Brick/Connection，保留可用部分，并生成 ProjectRecoveryReport。
