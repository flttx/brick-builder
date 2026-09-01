# Asset Release

Asset Pack 必须不可变发布：build → validate → upload immutable files → smoke → publish index → switch current pointer。

绝不能先发布新 index 再慢慢上传 GLB。

严重问题时 `current` 指针直接回滚到旧 Asset Pack。Pipeline 与 Asset Pack 分别版本化。
