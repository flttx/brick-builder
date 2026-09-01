# Command 与 Undo/Redo

所有真正修改作品的操作通过 Command：

- AddPlacedBrickCommand
- PlaceBrickCommand
- RotateBrickCommand
- DeleteBrickCommand
- ChangeColorCommand

一个用户 Gesture 对应一个 Command。PointerMove 绝不能不断生成 Command。

`PlaceBrickCommand` 应保存 before/after Transform 与 ConnectionGroups，使 Undo 可以准确恢复旧连接。

History 建议限制 100~300 条或按内存预算清理最老记录。重新打开作品后可以清空 Undo 栈，V1 不要求持久化命令历史。
