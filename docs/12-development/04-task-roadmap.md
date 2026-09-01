# 完整任务 Roadmap

## Prototype Phase 1

- T01 项目基础骨架
- T02 Engine Math Foundation
- T03 Part Definition
- T04 Standard Part Generator
- T05 Connector System
- T06 Connector Spatial Index
- T07 Snap Transform Solver
- T08 Snap Candidate System
- T09 Snap Stability
- T10 Collision Foundation
- T11 Placement Validator
- T12 Connection Graph
- T13 Engine Drag Session
- T14 Command History
- T15 Engine Snapshot

## Prototype Phase 2

- T16 Renderer Skeleton
- T17 Brick Renderer Adapter
- T18 Picking
- T19 Camera Controller
- T20 Interaction State Machine
- T21 Brick Drag
- T22 Engine + Renderer Snap
- T23 Placement Commit
- T24 Detach Interaction
- T25 Rotate
- T26 Undo / Redo UI
- T27 Snap Visual Feedback
- T28 Connection Feedback
- T29 Debug HUD
- T30 Prototype Benchmark
- T31 Prototype Acceptance

## MVP

T32~T53，详见 `02-mvp-plan.md`。

## V1

T54~T75，详见 `03-v1-plan.md`。

## 每个 Codex 任务必须输出

- Implemented
- Files changed
- Key decisions
- Tests added
- Validation actually run
- Known limitations
- Next task

任务涉及 Engine 至少运行 typecheck/lint/unit/engine tests；涉及 Web 还需 build 和必要的 browser verification。
