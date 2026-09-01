import { describe, expect, it, vi } from "vitest";
import { MemoryLocalProjectIndexStore } from "../packages/project-persistence/local-project-index.js";
import { QualityManager } from "../apps/web/src/editor/performance/quality-manager.js";
import { WebGLRecoveryController } from "../apps/web/src/editor/recovery/webgl-recovery-controller.js";
import { TelemetryManager, type TelemetryEvent, type TelemetryReporter } from "../apps/web/src/editor/telemetry/telemetry-manager.js";
import { createDiagnosticsReport, diagnosticsJson } from "../apps/web/src/editor/debug/diagnostics.js";
import { FaultInjectionController } from "../apps/web/src/editor/debug/fault-injection.js";
import { createBucketPhysicsSession } from "../apps/web/src/editor/physics/bucket-physics.js";
import { FrameCoordinator } from "../apps/web/src/editor/performance/frame-coordinator.js";
import { DebugVisuals } from "../apps/web/src/editor/debug/debug-visuals.js";
import { BrickEngine } from "../src/index.js";
import * as THREE from "three";

describe("offline index and recovery", () => {
  it("loads an unknown asset as a visible placeholder proxy", () => {
    const engine = new BrickEngine();
    engine.loadSnapshot({ version: 1, bricks: [{ id: "missing", partId: "missing-part", colorId: "red", position: [0, 0, 0], rotation: [0, 0, 0, 1] }], connections: [] });
    expect(engine.bricks.has("missing")).toBe(true);
    expect(engine.parts.get("missing-part").metadata?.missingAsset).toBe(true);
  });

  it("updates local project state and clears only the user namespace", async () => {
    const store = new MemoryLocalProjectIndexStore();
    await store.upsert({ userId: "u", projectId: "p", name: "Build", serverRevision: 2, lastLocalRevision: 3, lastOpenedAt: 10, isPinned: true, offlineReady: true, dirty: true });
    expect(await store.patch("u", "p", { dirty: false })).toMatchObject({ isPinned: true, dirty: false });
    await store.upsert({ userId: "other", projectId: "p", name: "Other", serverRevision: 1, lastLocalRevision: 1, lastOpenedAt: 1, isPinned: false, offlineReady: false, dirty: false });
    await store.clearUser("u");
    expect(await store.get("u", "p")).toBeNull();
    expect(await store.get("other", "p")).not.toBeNull();
  });

  it("uses sustained low FPS and hysteresis before changing quality", () => {
    const manager = new QualityManager({ level: "high", dpr: 1.5, shadows: true, postProcessing: true });
    for (let index = 0; index < 7; index += 1) expect(manager.update(35, 0.25)).toBeNull();
    expect(manager.update(35, 0.25)?.level).toBe("balanced");
    for (let index = 0; index < 12; index += 1) expect(manager.update(60, 0.25)).toBeNull();
    expect(manager.getSettings().level).toBe("balanced");
  });

  it("prevents default on loss, saves locally, pauses, and recreates on restore", async () => {
    const canvas = new EventTarget() as unknown as HTMLCanvasElement;
    const saveLocal = vi.fn(); const pause = vi.fn(); const resume = vi.fn(); const recreate = vi.fn(async () => undefined); const states: string[] = [];
    const controller = new WebGLRecoveryController(canvas, { saveLocal, pause, resume, recreate, onStateChange: (state) => states.push(state) });
    controller.attach();
    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(saveLocal).toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    await Promise.resolve();
    expect(recreate).toHaveBeenCalled();
    expect(resume).toHaveBeenCalled();
    expect(states).toEqual(["context_lost", "recovering", "healthy"]);
  });
});

describe("privacy, diagnostics and fault injection", () => {
  it("reports only allowlisted telemetry fields", () => {
    const events: TelemetryEvent[] = [];
    const reporter: TelemetryReporter = { report: (event) => { events.push(event); } };
    const manager = new TelemetryManager({ enabled: true, consent: true, appVersion: "test", assetPackVersion: "1", reporter, sessionId: "anon-test", now: () => 1 });
    manager.record("asset_failure", { partId: "brick-2x4", snapshot: "private", keyword: "secret" });
    expect(events[0]?.fields).toEqual({ partId: "brick-2x4" });
  });

  it("keeps diagnostics free of project snapshot data", () => {
    const report = createDiagnosticsReport({ appVersion: "test", assetPackVersion: "1", projectId: "p", brickCount: 3, connectionCount: 1, history: { undo: 2, redo: 0, limit: 200 }, render: { instances: 3, batches: 1, chunks: 1, drawCalls: 1 }, quality: { level: "high", dpr: 1.5 }, recovery: "healthy", offline: false, consistency: { valid: true, issueCount: 0 } });
    expect(diagnosticsJson(report)).not.toContain("snapshot");
  });

  it("only consumes enabled development faults", () => {
    const faults = new FaultInjectionController(true);
    faults.toggle("failNextAssetLoad");
    expect(faults.consume("failNextAssetLoad")).toBe(true);
    expect(faults.consume("failNextAssetLoad")).toBe(false);
    const disabled = new FaultInjectionController(false);
    disabled.toggle("simulateOffline");
    expect(disabled.getState().simulateOffline).toBe(false);
  });

  it("provides a deterministic tween fallback without physics bodies", async () => {
    const session = await createBucketPhysicsSession({ mode: "tween", bodyCount: 8, seed: 7 });
    expect(session.mode).toBe("tween");
    expect(session.bodyCount).toBe(8);
    session.update(1 / 60);
    session.dispose();
  });

  it("supports demand rendering requests and reuses debug objects", () => {
    const frames = vi.fn();
    const coordinator = new FrameCoordinator("demand");
    coordinator.subscribe(frames);
    expect(coordinator.consumeFrameRequest()).toBe(false);
    coordinator.requestFrame();
    expect(coordinator.consumeFrameRequest()).toBe(true);
    expect(coordinator.consumeFrameRequest()).toBe(false);
    coordinator.pause(); coordinator.requestFrame(); expect(coordinator.consumeFrameRequest()).toBe(false); coordinator.resume(); expect(frames).toHaveBeenCalled();

    const engine = new BrickEngine();
    engine.createBrick({ id: "debug-brick", partId: "brick-1x1" });
    const scene = new THREE.Scene();
    const visuals = new DebugVisuals(scene, engine);
    visuals.update();
    const first = scene.getObjectByName("brick-builder-debug")?.children[0]?.children[0];
    visuals.update();
    const second = scene.getObjectByName("brick-builder-debug")?.children[0]?.children[0];
    expect(second).toBe(first);
    visuals.dispose();
  });
});
