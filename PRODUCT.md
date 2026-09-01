# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: React + React Three Fiber + Three.js + Vite, because Prototype Phase 2 explicitly requires a browser-based R3F renderer while keeping Brick Engine framework-independent.

## Users

Brief-derived assumption: people experimenting with small digital brick assemblies in a desktop browser, primarily evaluating whether two standard 2×4 bricks feel natural to pick, drag, snap, detach, and reconnect.

## Product Purpose

Brick Builder lets a user arrange standard bricks in a 3D workspace. Success for this prototype means that Engine truth and direct manipulation stay synchronized through the full pick → drag → snap → commit → undo/redo loop.

## Positioning

The product's core mechanism is deterministic connector-aware brick placement: the renderer presents the work, while Brick Engine remains the sole authority for transforms, connections, collision, and history.

## Operating Context

The first surface is a full-screen interactive 3D editor with a gray desk. The normal project is empty; `?demo=1` provides two bricks for interaction checks. Parts, Bucket, Color, placement, selection actions, and a compact debug HUD surround the canvas.

## Capabilities and Constraints

- Implemented scope is T32–T61: the connector-aware editor, ProjectFile migration, IndexedDB Draft/Cache recovery, autosave, opaque-session auth, project API, My Builds, thumbnails, conflict handling, Basic PWA shell, a deterministic local Asset Pack, runtime GLB registry, LOD, asset validation, Asset Inspector, and Part Authoring metadata overlays.
- Brick Engine must remain free of React, Three.js, DOM, and browser APIs.
- Renderer uses InstancedMesh batches and adapters; interaction uses explicit state transitions and pointer capture.
- No Technic behavior, Rapier, audio, haptics, community, sharing, multiplayer, full offline asset system, CDN release, or future part systems are in scope.

## Evidence on Hand

The repository contains the Phase 1 architecture documents, pure TypeScript engine, tests, benchmarks, a local Asset Pack with 16 generated GLBs/LODs/thumbnails, runtime manifests, and Asset Inspector/Authoring routes. Runtime assets use procedural source records with CC0 provenance; the LDraw parser is covered by a basic fixture and remains available for future source records.

## Product Principles

- Engine truth over renderer convenience.
- A brick should follow the user's grab point without jumping.
- Snap should feel stable and explainable.
- Camera and brick gestures must have clear ownership.
- Debug visibility is part of prototype quality, not a substitute for interaction quality.
- Precision Connect selects one moving connector and one nearby compatible target, then lets the Engine solve the transform and complete all valid matched pairs before confirmation.
- Local Draft reliability comes before cloud polish; revision conflicts never silently overwrite another device.

## Accessibility & Inclusion

The prototype should provide keyboard-accessible controls and visible focus states for HUD actions, respect reduced-motion preferences for visual feedback, and expose important state changes through text labels rather than color alone.
