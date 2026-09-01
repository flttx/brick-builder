# Telemetry

Telemetry V1 应克制，只关注真正影响产品稳定性的事件：frontend crash、asset load failure、cloud save failure、WebGL context lost、performance summary。

不默认上传完整作品、Brick 坐标列表、作品图片、密码或 Session Token。

性能数据按 30~60 秒窗口聚合 P50/P95，不逐帧上传。
