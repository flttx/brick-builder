# Three.js 与 R3F 架构

R3F 负责 Canvas、Scene 生命周期、灯光、环境与 React 桥接，但核心 Engine 不进入组件内部。

不应让每个 Brick 成为高频 React Component。高频 Runtime 更新通过 Renderer Runtime/Frame Coordinator 直接更新 Three.js matrix。

建议统一 `Frame Coordinator`：按当前状态决定本帧执行 Input、Snap、Camera、Animation、Physics、Batch Flush 中的哪些步骤，避免大量分散的 `useFrame()`。
