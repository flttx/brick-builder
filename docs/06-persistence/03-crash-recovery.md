# Crash Recovery

页面隐藏、pagehide、WebGL Context Lost 等场景优先 flush Local Draft。

打开项目时比较 Cloud、Cached Snapshot、Draft：

- Draft 明显更新且服务器没有并发变化：自动恢复并轻提示
- 双方均更新：进入 Conflict Resolver

不要依赖 beforeunload 完成关键网络保存。
