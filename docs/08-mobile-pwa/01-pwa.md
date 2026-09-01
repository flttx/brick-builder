# PWA

Manifest 使用 `display: standalone`、`orientation: any`，准备 192/512 与 maskable icon。

PWA 用于 App Shell、安装体验和离线缓存，不把它当原生 App 能力等价物。

发现新 Service Worker 时不要在用户编辑过程中自动 reload，应在离开 Editor 或下次启动安全切换。
