# 装饰物理

Rapier 只用于 Bucket、散落/弹跳等短期视觉运动。

已拼好的大作品正常编辑时不建立全场动态 RigidBody。Bucket Session 使用临时 Physics Bodies，动画结束必须 remove/free。

Performance 模式可以完全关闭 Rapier，以 Tween/Proxy Animation 替代。
