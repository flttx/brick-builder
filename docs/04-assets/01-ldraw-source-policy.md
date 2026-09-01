# LDraw 来源策略

优先使用 LDraw Parts Library 作为初期零件来源，通过离线转换生成 Web Runtime Assets。

Game Part ID 与 LDraw sourcePartId 分离：例如 `brick-2x4` 与外部 source ID 分开存储。

公开/商业版本应保留来源与许可记录，并避免默认在 Stud 上复刻 LEGO Logo。零件来源、作者、许可、sourceVersion 写入 Source Manifest。
