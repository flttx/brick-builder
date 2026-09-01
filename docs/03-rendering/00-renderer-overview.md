# Renderer 总览

Renderer 将 Brick Engine 状态映射为 Three.js 场景，不拥有业务真相。

主要模块：RenderBatch、BatchRegistry、Picking、Selection/Drag Proxy、CameraController、InteractionController、Feedback、PerformanceManager。

同 Part + Rendering Variant 的 Brick 使用 InstancedMesh。正在拖动的 Brick 可临时转为普通 Drag Proxy，以便高频变换、Outline、Snap Feedback，而不污染批次逻辑。
