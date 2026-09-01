import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { BrickProjectSnapshot, ConnectionGroup, DragResult, ExplicitSnapRequest, PlacementMode, Transform } from "../../../../src/index.js";
import { BASIC_BRICK_BUCKET, BrickBucket, BrickEngine } from "../../../../src/index.js";
import { createWebpThumbnail, IndexedDbCachedProjectStore, IndexedDbLocalDraftStore, SaveManager, type LocalProjectIndexStore, type ProjectRepository, type SaveState } from "../../../../packages/project-persistence/index.js";
import { isRuntimePartManifest, partDefinitionFromRuntimeManifest } from "../../../../packages/brick-assets/asset-types.js";
import { identity } from "../../../../src/math/quat.js";
import type { BrickColor } from "../../../../src/colors/brick-color.js";
import { ThreeCameraController } from "./camera/camera-controller.js";
import { type DebugFlags, DEFAULT_DEBUG_FLAGS } from "./debug/debug-visuals.js";
import type { DebugVisuals } from "./debug/debug-visuals.js";
import type { InteractionMetrics, InteractionState, PrecisionInteractionState } from "./interaction/interaction-controller.js";
import { PartBrowser } from "./parts/part-browser.js";
import { createPartIndex, createRuntimePartIndex, isRuntimePartIndex, type PartIndexItem } from "./parts/part-index.js";
import { readRecentParts, recordRecentPart } from "./parts/recent-parts.js";
import type { PlacementCommit } from "./placement/placement-controller.js";
import { createPlacementSession, type NewBrickPlacementSession, type PlacementSource } from "./placement/placement-session.js";
import type { PrecisionPreviewState } from "./precision/precision-overlay.js";
import type { ThreeBrickRenderer } from "./renderer/brick-renderer.js";
import { type FrameMetrics, EditorScene } from "./scene/editor-scene.js";
import type { Plane } from "three";
import { localizeColorName, localizeInteractionState, localizePartName, localizePlacementMode, messageForErrorCode, messages } from "../i18n/index.js";
import { QualityManager, guessInitialQuality, qualitySettings, type QualityLevel, type QualitySettings } from "./performance/quality-manager.js";
import type { WebGLRecoveryState } from "./recovery/webgl-recovery-controller.js";
import { AudioManager } from "./feedback/audio-manager.js";
import { FeedbackOrchestrator } from "./feedback/feedback-orchestrator.js";
import { HapticManager } from "./feedback/haptic-manager.js";
import { createBucketPhysicsSession, type BucketPhysicsSession } from "./physics/bucket-physics.js";
import { FaultInjectionController, type FaultName, type FaultState } from "./debug/fault-injection.js";
import { createDiagnosticsReport, diagnosticsJson } from "./debug/diagnostics.js";
import { DevToolsShell, type DevToolsTab } from "./debug/devtools-shell.js";
import { TelemetryManager } from "./telemetry/telemetry-manager.js";
import { resolveRuntimePartIndexUrl } from "../offline/runtime-asset-cache.js";

interface EditorUiState {
  selectedBrickId: string | undefined;
  hoveredBrickId: string | undefined;
  interactionState: InteractionState;
  frame: FrameMetrics;
  interaction: InteractionMetrics;
  revision: number;
}

interface PrecisionEditorSession {
  movingBrickId: string;
  state: PrecisionInteractionState;
  sourceConnectorId?: string;
  targetConnectorId?: string;
  preview?: PrecisionPreviewState;
}

const placementModes: PlacementMode[] = ["auto", "free", "precision"];

const initialFrame: FrameMetrics = { fps: 0, frameMs: 0, drawCalls: 0, instanceCount: 0, triangles: 0 };
const initialInteraction: InteractionMetrics = { snapTime: 0, collisionTime: 0 };

export interface EditorPersistenceOptions {
  userId: string;
  projectId: string;
  baseServerRevision: number;
  repository: ProjectRepository;
  indexStore?: LocalProjectIndexStore;
}

export interface EditorAppProps {
  projectId?: string;
  projectName?: string;
  initialSnapshot?: BrickProjectSnapshot;
  initialNotice?: string;
  recoveredDraft?: boolean;
  persistence?: EditorPersistenceOptions;
  onBackToProjects?: () => void;
  onConflict?: (localSnapshot: BrickProjectSnapshot) => void;
  onAuthRequired?: () => void;
  authEpoch?: number;
  benchmark?: boolean;
}

export const EditorApp = ({ projectId = "local-project", projectName = "Local Draft", initialSnapshot, initialNotice, recoveredDraft = false, persistence, onBackToProjects, onConflict, onAuthRequired, authEpoch, benchmark = false }: EditorAppProps = {}): ReactElement => {
  const benchmarkSize = useMemo(() => readBenchmarkSize(), []);
  const benchmarkLayout = useMemo(() => readBenchmarkLayout(), []);
  const benchmarkQuality = useMemo(() => readBenchmarkQuality(), []);
  const demo = useMemo(() => new URLSearchParams(window.location.search).get("demo") === "1", []);
  const precisionDemo = useMemo(() => new URLSearchParams(window.location.search).get("precision") === "1", []);
  const engine = useMemo(() => createPrototypeEngine(benchmarkSize, demo, precisionDemo, benchmarkLayout), [benchmarkLayout, benchmarkSize, demo, precisionDemo]);
  const cameraController = useMemo(() => new ThreeCameraController(engine), [engine]);
  const initialQuality = useMemo<QualitySettings>(() => { if (benchmark) return qualitySettings(benchmarkQuality); if (typeof navigator === "undefined") return guessInitialQuality(); const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory; return guessInitialQuality({ ...(navigator.hardwareConcurrency === undefined ? {} : { hardwareConcurrency: navigator.hardwareConcurrency }), ...(navigator.maxTouchPoints === undefined ? {} : { maxTouchPoints: navigator.maxTouchPoints }), ...(deviceMemory === undefined ? {} : { deviceMemory }) }); }, [benchmark, benchmarkQuality]);
  const qualityManager = useMemo(() => new QualityManager(initialQuality), [initialQuality]);
  const [quality, setQuality] = useState<QualitySettings>(initialQuality);
  const faults = useMemo(() => new FaultInjectionController(import.meta.env.DEV), []);
  const [faultState, setFaultState] = useState<FaultState>(() => faults.getState());
  const [devToolsTab, setDevToolsTab] = useState<DevToolsTab>("scene");
  const [recoveryState, setRecoveryState] = useState<WebGLRecoveryState>("healthy");
  const audio = useMemo(() => new AudioManager(), []);
  const haptic = useMemo(() => new HapticManager(), []);
  const feedback = useMemo(() => new FeedbackOrchestrator(audio, haptic), [audio, haptic]);
  const telemetry = useMemo(() => new TelemetryManager({ enabled: import.meta.env.PROD, consent: typeof localStorage !== "undefined" && localStorage.getItem("brick-builder-telemetry-consent") === "true", appVersion: "0.1.0", assetPackVersion: "v1" }), []);
  const [runtimePartIndex, setRuntimePartIndex] = useState<PartIndexItem[] | undefined>();
  const partIndex = useMemo(() => runtimePartIndex ?? createPartIndex(engine.parts.values()), [engine, runtimePartIndex]);
  const bucket = useMemo(() => new BrickBucket(engine.parts.values(), { ...BASIC_BRICK_BUCKET, seedMode: "random" }), [engine]);
  const browserStorage = typeof localStorage === "undefined" ? undefined : localStorage;
  const [recentPartIds, setRecentPartIds] = useState(() => readRecentParts(browserStorage));
  const [currentColorId, setCurrentColorId] = useState("red");
  const [placementMode, setPlacementMode] = useState<PlacementMode>("auto");
  const [activePlacementMode, setActivePlacementMode] = useState<PlacementMode>("auto");
  const [bucketPulse, setBucketPulse] = useState(false);
  const [bucketPhysicsSequence, setBucketPhysicsSequence] = useState(0);
  const [partBrowserOpen, setPartBrowserOpen] = useState(false);
  const [placementSession, setPlacementSession] = useState<NewBrickPlacementSession | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [precision, setPrecision] = useState<PrecisionEditorSession | undefined>();
  const placementNumber = useRef(1);
  const [ui, setUi] = useState<EditorUiState>({ selectedBrickId: undefined, hoveredBrickId: undefined, interactionState: "idle", frame: initialFrame, interaction: initialInteraction, revision: 0 });
  const [debugFlags, setDebugFlags] = useState<DebugFlags>(DEFAULT_DEBUG_FLAGS);
  const candidateRef = useRef<DragResult["candidate"]>(undefined);
  const rendererRef = useRef<ThreeBrickRenderer | null>(null);
  const debugRef = useRef<DebugVisuals | null>(null);
  const lastMetricCommit = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recoveryRetryRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const [saveState, setSaveState] = useState<SaveState | undefined>();
  const [physics, setPhysics] = useState<BucketPhysicsSession | undefined>();
  const conflictNotified = useRef(false);
  const authEpochRef = useRef(authEpoch);
  useEffect(() => {
    let active = true;
    void resolveRuntimePartIndexUrl().then((indexUrl) => fetch(indexUrl)).then(async (response) => {
      if (!response.ok) throw new Error("Runtime part index unavailable");
      const value = await response.json() as unknown;
      if (!isRuntimePartIndex(value)) throw new Error("Runtime part index is invalid");
      if (active) setRuntimePartIndex(createRuntimePartIndex(value));
      await mapWithConcurrency(value, 6, async (item) => {
        const manifestResponse = await fetch(item.manifestUrl);
        if (!manifestResponse.ok) return;
        const manifest = await manifestResponse.json() as unknown;
        if (active && isRuntimePartManifest(manifest)) engine.parts.upsert(partDefinitionFromRuntimeManifest(manifest));
      });
      if (active) engine.refreshPartDefinitions();
    }).catch(() => undefined);
    return () => { active = false; };
  }, [engine]);
  const saveManager = useMemo(() => persistence === undefined ? undefined : new SaveManager({ userId: persistence.userId, projectId: persistence.projectId, baseServerRevision: persistence.baseServerRevision, repository: persistence.repository, draftStore: new IndexedDbLocalDraftStore(), cachedStore: new IndexedDbCachedProjectStore(), ...(persistence.indexStore === undefined ? {} : { indexStore: persistence.indexStore }), projectName, shouldFailNextCloudSave: () => faults.consume("failNextCloudSave"), shouldForceConflict: () => faults.consume("force409"), onCloudSaved: async () => { const canvas = canvasRef.current; if (canvas === null) return; const blob = await createWebpThumbnail(canvas); const dataUrl = await blobToDataUrl(blob); await persistence.repository.uploadThumbnail(persistence.projectId, dataUrl); } }), [faults, persistence, projectName]);

  useEffect(() => faults.subscribe(setFaultState), [faults]);
  useEffect(() => () => { audio.dispose(); }, [audio]);
  useEffect(() => {
    if (bucketPhysicsSequence === 0) return;
    let active = true;
    const timer = window.setTimeout(() => { setPhysics((current) => { current?.dispose(); return undefined; }); }, 1000);
    void createBucketPhysicsSession({ mode: quality.level === "low" ? "tween" : "rapier", bodyCount: quality.level === "high" ? 20 : 8, seed: bucket.getDrawIndex() }).then((session) => { if (active) setPhysics(session); else session.dispose(); }).catch(() => undefined);
    return () => { active = false; window.clearTimeout(timer); setPhysics((current) => { current?.dispose(); return undefined; }); };
  }, [bucket, bucketPhysicsSequence, quality.level]);
  useEffect(() => {
    if (saveManager === undefined) return;
    const updateOnline = (): void => saveManager.setOnline(!faultState.simulateOffline && (typeof navigator === "undefined" || navigator.onLine));
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => { window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, [faultState.simulateOffline, saveManager]);
  useEffect(() => {
    const timer = window.setInterval(() => telemetry.flushPerformanceSummary(), 30_000);
    return () => { window.clearInterval(timer); telemetry.flushPerformanceSummary(); };
  }, [telemetry]);

  const bumpRevision = useCallback(() => { setUi((current) => ({ ...current, revision: current.revision + 1 })); }, []);
  const syncAfterCommand = useCallback(() => { rendererRef.current?.syncFromEngine(); debugRef.current?.update(); bumpRevision(); }, [bumpRevision]);
  useEffect(() => { if (initialSnapshot !== undefined) { engine.loadSnapshot(initialSnapshot); bumpRevision(); } }, [bumpRevision, engine, initialSnapshot]);
  useEffect(() => saveManager?.subscribe(setSaveState), [saveManager]);
  useEffect(() => { if (recoveredDraft && initialSnapshot !== undefined && saveManager !== undefined) saveManager.markDirty(initialSnapshot); }, [initialSnapshot, recoveredDraft, saveManager]);
  useEffect(() => {
    if (saveManager === undefined) return;
    const unsubscribe = engine.subscribeCommandCommitted(() => saveManager.markDirty(engine.getSnapshot()));
    const flush = (): void => { void saveManager.flushLocal(); if (document.visibilityState === "hidden") void saveManager.flushCloud(); };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => { unsubscribe(); document.removeEventListener("visibilitychange", flush); window.removeEventListener("pagehide", flush); saveManager.dispose(); };
  }, [engine, saveManager]);
  useEffect(() => { if (initialNotice !== undefined) setNotice(initialNotice); }, [initialNotice]);
  useEffect(() => { if (saveState?.error === "PROJECT_CONFLICT" && !conflictNotified.current) { conflictNotified.current = true; onConflict?.(engine.getSnapshot()); } if (saveState?.error !== "PROJECT_CONFLICT") conflictNotified.current = false; }, [engine, onConflict, saveState?.error]);
  useEffect(() => { if (saveState?.error === "PROJECT_CONFLICT") telemetry.record("conflict", { count: 1 }); if (saveState?.error === "SYNC_ERROR") telemetry.record("cloud_save_failure", { status: saveState.error }); }, [saveState?.error, telemetry]);
  useEffect(() => { if (authEpoch !== undefined && authEpoch !== authEpochRef.current) { authEpochRef.current = authEpoch; void saveManager?.flushCloud(); } }, [authEpoch, saveManager]);
  const handleSelectionChange = useCallback((selectedBrickId: string | undefined) => { setUi((current) => ({ ...current, selectedBrickId })); }, []);
  const handleHoverChange = useCallback((hoveredBrickId: string | undefined) => { setUi((current) => ({ ...current, hoveredBrickId })); }, []);
  const handleStateChange = useCallback((interactionState: InteractionState) => { setUi((current) => ({ ...current, interactionState })); }, []);
  const handleActivePlacementModeChange = useCallback((mode: PlacementMode) => { setActivePlacementMode(mode); }, []);
  const handleDragResult = useCallback((_freeTransform: Transform, result: DragResult) => { candidateRef.current = result.candidate; }, []);
  const handleDragPlaneChange = useCallback((_plane: Plane | undefined) => { if (_plane === undefined) candidateRef.current = undefined; }, []);
  const handleInteractionMetricsChange = useCallback((interaction: InteractionMetrics) => {
    const now = performance.now();
    if (now - lastMetricCommit.current >= 120) { lastMetricCommit.current = now; setUi((current) => ({ ...current, interaction })); }
  }, []);
  const handleFrameMetrics = useCallback((frame: FrameMetrics) => { setUi((current) => ({ ...current, frame })); telemetry.recordFrame(frame.fps, frame.frameMs, frame.drawCalls); if (!benchmark) { const nextQuality = qualityManager.update(frame.fps, 0.25); if (nextQuality !== null) setQuality(nextQuality); } }, [benchmark, qualityManager, telemetry]);
  const handleDebugToggle = useCallback((key: keyof DebugFlags) => { setDebugFlags((current) => ({ ...current, [key]: !current[key] })); }, []);
  const handleRendererReady = useCallback((renderer: ThreeBrickRenderer) => { rendererRef.current = renderer; }, []);
  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => { canvasRef.current = canvas; }, []);
  const handleDebugReady = useCallback((debug: DebugVisuals) => { debugRef.current = debug; }, []);
  const handleRecoveryStateChange = useCallback((state: WebGLRecoveryState) => { setRecoveryState(state); telemetry.record(state === "context_lost" ? "context_loss" : state === "failed" ? "fatal" : "performance_summary", { status: state }); }, [telemetry]);
  const handleRecoveryRetryReady = useCallback((retry: () => Promise<void>) => { recoveryRetryRef.current = retry; }, []);
  const handleFaultToggle = useCallback((name: FaultName) => { faults.toggle(name); if (name === "loseWebGLContext") window.setTimeout(() => { if (canvasRef.current !== null) faults.dispatchContextLoss(canvasRef.current); }, 0); }, [faults]);
  const handleValidate = useCallback(() => { const result = engine.validateEngineConsistency(); setNotice(result.valid ? messages.editor.debug.consistent : messages.editor.debug.checkRequired); }, [engine]);
  const handleExportDiagnostics = useCallback(() => {
    const consistency = engine.validateEngineConsistency();
    const report = createDiagnosticsReport({ appVersion: "0.1.0", assetPackVersion: "v1", projectId, brickCount: engine.bricks.size, connectionCount: engine.graph.size, history: { undo: engine.history.size, redo: engine.history.redoSize, limit: engine.history.maxSize }, render: { instances: ui.frame.instanceCount, batches: rendererRef.current?.batches.size ?? 0, chunks: rendererRef.current?.getChunkCount() ?? 0, drawCalls: ui.frame.drawCalls }, quality: { level: quality.level, dpr: quality.dpr }, recovery: recoveryState, offline: saveState?.offline ?? false, consistency: { valid: consistency.valid, issueCount: consistency.errors.length } });
    const url = URL.createObjectURL(new Blob([diagnosticsJson(report)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${projectId}-diagnostics.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [engine, projectId, quality, recoveryState, saveState?.offline, ui.frame]);
  const startPlacement = useCallback((partId: string, source: PlacementSource) => {
    if (placementMode === "precision") {
      setNotice(messages.editor.placement.precisionSelectionRequired);
      return;
    }
    setNotice(undefined);
    setPartBrowserOpen(false);
    setPlacementSession(createPlacementSession(placementNumber.current++, partId, currentColorId, source));
  }, [currentColorId, placementMode]);
  const handleBucketDraw = useCallback(() => { void feedback.afterUserGesture(() => feedback.bucket()).catch(() => undefined); setBucketPhysicsSequence((value) => value + 1); setBucketPulse(true); window.setTimeout(() => setBucketPulse(false), 180); const draw = bucket.draw(currentColorId); startPlacement(draw.partId, "bucket"); }, [bucket, currentColorId, feedback, startPlacement]);
  const handlePlacementCommitted = useCallback((commit: PlacementCommit) => {
    try {
      const groups: ConnectionGroup[] = commit.candidate === undefined ? [] : [{ id: engine.allocateConnectionId(), brickA: commit.brick.id, brickB: commit.candidate.targetBrickId, type: "rigid", pairs: commit.candidate.matchedPairs.map((pair) => ({ connectorA: pair.moving.id, connectorB: pair.target.id })) }];
      engine.addPlacedBrick(commit.brick, groups);
      setRecentPartIds(recordRecentPart(commit.brick.partId, browserStorage));
      setUi((current) => ({ ...current, selectedBrickId: commit.brick.id }));
      setPlacementSession(undefined);
      candidateRef.current = undefined;
      void feedback.afterUserGesture(() => feedback.placement(commit.candidate !== undefined)).catch(() => undefined);
      syncAfterCommand();
    } catch {
      setNotice(messages.editor.placement.occupied);
      setPlacementSession(undefined);
      candidateRef.current = undefined;
    }
  }, [browserStorage, engine, feedback, syncAfterCommand]);
  const handlePlacementCancelled = useCallback(() => { setPlacementSession(undefined); candidateRef.current = undefined; }, []);
  const rotateSelected = useCallback(() => { if (ui.selectedBrickId !== undefined) { engine.rotateBrick(ui.selectedBrickId); syncAfterCommand(); } }, [engine, syncAfterCommand, ui.selectedBrickId]);
  const duplicateSelected = useCallback(() => { const selected = ui.selectedBrickId === undefined ? undefined : engine.bricks.tryGet(ui.selectedBrickId); if (selected !== undefined) startPlacement(selected.partId, "duplicate"); }, [engine, startPlacement, ui.selectedBrickId]);
  const deleteSelected = useCallback(() => {
    if (ui.selectedBrickId === undefined) return;
    try { engine.deleteBrick(ui.selectedBrickId); void feedback.afterUserGesture(() => { feedback.detach(); feedback.delete(); }).catch(() => undefined); setUi((current) => ({ ...current, selectedBrickId: undefined })); syncAfterCommand(); } catch { setNotice(messages.editor.placement.cannotDelete); }
  }, [engine, feedback, syncAfterCommand, ui.selectedBrickId]);
  const chooseColor = useCallback((color: BrickColor) => { setCurrentColorId(color.id); if (ui.selectedBrickId !== undefined) { engine.changeBrickColor(ui.selectedBrickId, color.id); syncAfterCommand(); } }, [engine, syncAfterCommand, ui.selectedBrickId]);
  const undo = useCallback(() => { if (engine.undo()) { void feedback.afterUserGesture(() => feedback.undo()).catch(() => undefined); syncAfterCommand(); } }, [engine, feedback, syncAfterCommand]);
  const redo = useCallback(() => { if (engine.redo()) { void feedback.afterUserGesture(() => feedback.redo()).catch(() => undefined); syncAfterCommand(); } }, [engine, feedback, syncAfterCommand]);

  const requestPlacementMode = useCallback((mode: PlacementMode) => {
    if (mode === "precision") {
      if (ui.selectedBrickId === undefined) {
        setNotice(messages.editor.placement.precisionSelectionRequired);
        return;
      }
      setNotice(undefined);
      setPlacementMode(mode);
      setActivePlacementMode(mode);
      setPrecision({ movingBrickId: ui.selectedBrickId, state: "precision_pick_source" });
      return;
    }
    setPrecision(undefined);
    setPlacementMode(mode);
    setActivePlacementMode(mode);
    setNotice(undefined);
  }, [ui.selectedBrickId]);

  const handlePrecisionSource = useCallback((sourceConnectorId: string) => {
    setNotice(undefined);
    setPrecision((current) => current === undefined ? current : {
      movingBrickId: current.movingBrickId,
      state: "precision_pick_target",
      sourceConnectorId
    });
  }, []);

  const handlePrecisionTarget = useCallback((targetConnectorId: string, targetBrickId: string) => {
    const current = precision;
    if (current === undefined || current.sourceConnectorId === undefined) {
      return;
    }
    const movingBrick = engine.bricks.tryGet(current.movingBrickId);
    if (movingBrick === undefined) {
      setNotice(messages.editor.placement.brickUnavailable);
      return;
    }
    const request: ExplicitSnapRequest = {
      movingBrickId: current.movingBrickId,
      movingConnectorId: current.sourceConnectorId,
      targetBrickId,
      targetConnectorId,
      freeTransform: movingBrick.transform
    };
    const result = engine.solveExplicitSnap(request);
    if (!result.valid || result.transform === undefined) {
      setNotice(explicitSnapMessage(result.reason));
      return;
    }
    setNotice(undefined);
    setPrecision({
      movingBrickId: current.movingBrickId,
      state: "precision_preview",
      sourceConnectorId: current.sourceConnectorId,
      targetConnectorId,
      preview: { request, result }
    });
  }, [engine, precision]);

  const handlePrecisionCancel = useCallback(() => {
    setNotice(undefined);
    setPrecision((current) => current === undefined ? current : {
      movingBrickId: current.movingBrickId,
      state: "precision_pick_source"
    });
  }, []);

  const handlePrecisionConfirm = useCallback(() => {
    const preview = precision?.preview;
    if (preview === undefined) {
      return;
    }
    try {
      const result = engine.commitExplicitSnap(preview.request);
      setUi((current) => ({ ...current, selectedBrickId: preview.request.movingBrickId }));
      syncAfterCommand();
      setNotice(messages.editor.placement.connected(result.matchedPairs.length));
      setPrecision({ movingBrickId: preview.request.movingBrickId, state: "precision_pick_source" });
    } catch {
      setNotice(messages.editor.placement.connectorUnavailable);
    }
  }, [engine, precision, syncAfterCommand]);

  useEffect(() => {
    if (precision?.state !== "precision_preview") {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Enter") {
        event.preventDefault();
        handlePrecisionConfirm();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        handlePrecisionCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrecisionCancel, handlePrecisionConfirm, precision?.state]);

  const selectedBrick = ui.selectedBrickId === undefined ? undefined : engine.bricks.tryGet(ui.selectedBrickId);
  const selectedConnections = ui.selectedBrickId === undefined ? [] : engine.connections.getForBrick(ui.selectedBrickId);
  const candidate = candidateRef.current;
  const history = engine.history;
  const currentColor = engine.colors.get(currentColorId);
  const saveStatus = saveState === undefined ? messages.editor.status.local : saveState.saving ? messages.editor.status.saving : saveState.error !== undefined ? messageForErrorCode(saveState.error) : saveState.dirty ? messages.editor.status.draftSaved : messages.editor.status.saved;
  const rendererOptions = useMemo(() => ({ shouldFailNextAssetLoad: () => faults.consume("failNextAssetLoad"), onAssetFailure: (partId: string) => telemetry.record("asset_failure", { partId }) }), [faults, telemetry]);
  const saveLocal = useCallback(() => saveManager?.flushLocal(), [saveManager]);

  return (
    <main className="editor-shell" {...(benchmark ? { "data-benchmark-ready": "true", "data-benchmark-size": String(benchmarkSize ?? 0), "data-benchmark-fps": ui.frame.fps.toFixed(3), "data-benchmark-frame-ms": ui.frame.frameMs.toFixed(3), "data-benchmark-draw-calls": String(ui.frame.drawCalls), "data-benchmark-instances": String(ui.frame.instanceCount), "data-benchmark-triangles": String(ui.frame.triangles), "data-benchmark-batches": String(rendererRef.current?.batches.size ?? 0), "data-benchmark-chunks": String(rendererRef.current?.getChunkCount() ?? 0), "data-benchmark-quality": quality.level, "data-benchmark-dpr": quality.dpr.toFixed(2) } : {})}>
      <header className="top-rail"><div className="brand-lockup"><span className="brand-mark" aria-hidden="true">BB</span><div><p className="eyebrow">{messages.brand}</p><h1>{projectName}</h1></div></div><div className="session-status" aria-label={messages.editor.status.project}><span className={`status-dot${saveState?.saving ? " is-saving" : ""}`} aria-hidden="true" /><span>{saveStatus}</span><span className="status-divider" aria-hidden="true" /><span>{benchmarkSize === undefined ? projectId : `BENCH ${benchmarkSize}`}</span></div><div className="toolbar-actions">{onBackToProjects !== undefined && <button className="tool-button project-back-button" type="button" onClick={onBackToProjects} aria-label={messages.editor.toolbar.backToBuilds}>{messages.editor.toolbar.backToBuilds}</button>}<div className="placement-mode-control" aria-label={messages.editor.toolbar.placementMode}><span className="section-label">{messages.editor.toolbar.modeLabel}</span><div className="placement-mode-segmented">{placementModes.map((mode) => <button key={mode} type="button" className={activePlacementMode === mode ? "is-active" : ""} aria-pressed={placementMode === mode} onClick={() => requestPlacementMode(mode)} disabled={mode === "precision" && selectedBrick === undefined}>{localizePlacementMode(mode)}</button>)}</div><select className="placement-mode-select" aria-label={messages.editor.toolbar.placementMode} value={placementMode} onChange={(event) => requestPlacementMode(event.target.value as PlacementMode)}><option value="auto">{messages.editor.placement.modes.auto}</option><option value="free">{messages.editor.placement.modes.free}</option><option value="precision" disabled={selectedBrick === undefined}>{messages.editor.placement.modes.precision}</option></select></div><button className="tool-button" type="button" onClick={() => setPartBrowserOpen((open) => !open)} aria-expanded={partBrowserOpen} aria-label={messages.editor.toolbar.openParts}><PartsIcon /><span>{messages.editor.toolbar.parts}</span></button><button className={`tool-button bucket-button${bucketPulse ? " is-shaking" : ""}`} type="button" onClick={handleBucketDraw} aria-label={messages.editor.toolbar.drawFromBucket}><BucketIcon /><span>{messages.editor.toolbar.bucket}</span></button><button className="tool-button" type="button" onClick={() => cameraController.fitProject()} aria-label={messages.editor.toolbar.fitProject}><FitIcon /><span>{messages.editor.toolbar.fit}</span></button><button className="tool-button" type="button" onClick={rotateSelected} disabled={selectedBrick === undefined || placementSession !== undefined || precision !== undefined} aria-label={messages.editor.toolbar.rotateSelected}><RotateIcon /><span>{messages.editor.toolbar.rotate}</span></button><button className="icon-button" type="button" onClick={undo} disabled={!history.canUndo || placementSession !== undefined || precision !== undefined} aria-label={messages.editor.toolbar.undo}><UndoIcon /></button><button className="icon-button" type="button" onClick={redo} disabled={!history.canRedo || placementSession !== undefined || precision !== undefined} aria-label={messages.editor.toolbar.redo}><RedoIcon /></button></div></header>
      <section className="scene-wrap" aria-label={messages.editor.sceneAria}><EditorScene engine={engine} cameraController={cameraController} debugFlags={debugFlags} quality={quality} benchmark={benchmark} {...(physics === undefined ? {} : { physics })} rendererOptions={rendererOptions} selectedBrickId={ui.selectedBrickId} placementSession={placementSession} placementMode={placementMode} precision={precision === undefined ? undefined : { movingBrickId: precision.movingBrickId, state: precision.state, ...(precision.sourceConnectorId === undefined ? {} : { sourceConnectorId: precision.sourceConnectorId }), ...(precision.targetConnectorId === undefined ? {} : { targetConnectorId: precision.targetConnectorId }), ...(precision.preview === undefined ? {} : { preview: precision.preview }), onSourceConnector: handlePrecisionSource, onTargetConnector: handlePrecisionTarget }} onSelectionChange={handleSelectionChange} onHoverChange={handleHoverChange} onStateChange={handleStateChange} onDragResult={handleDragResult} onDragPlaneChange={handleDragPlaneChange} onInteractionMetricsChange={handleInteractionMetricsChange} onHistoryChange={bumpRevision} onFrameMetrics={handleFrameMetrics} onRendererReady={handleRendererReady} onDebugReady={handleDebugReady} onPlacementCommitted={handlePlacementCommitted} onPlacementCancelled={handlePlacementCancelled} onPlacementModeChange={handleActivePlacementModeChange} onCanvasReady={handleCanvasReady} onRecoveryStateChange={handleRecoveryStateChange} onRecoveryRetryReady={handleRecoveryRetryReady} saveLocal={saveLocal} /></section>
      {placementSession !== undefined && <div className="placement-banner" role="status"><strong>{messages.editor.placement.placePart(localizePartName(placementSession.partId, engine.parts.get(placementSession.partId).name))}</strong><span>{messages.editor.placement.dragHint}</span><button type="button" onClick={handlePlacementCancelled}>{messages.common.cancel}</button></div>}
      {precision !== undefined && <div className="precision-banner" role="status"><strong>{precision.state === "precision_pick_source" ? messages.editor.placement.precision.pickSource : precision.state === "precision_pick_target" ? messages.editor.placement.precision.pickTarget : messages.editor.placement.precision.preview}</strong><span>{precision.state === "precision_preview" ? messages.editor.placement.precision.pairCount(precision.preview?.result.matchedPairs.length ?? 0) : messages.editor.placement.precision.hint}</span>{precision.state === "precision_preview" && <button type="button" onClick={handlePrecisionConfirm}>{messages.editor.placement.precision.confirm}</button>}<button type="button" onClick={handlePrecisionCancel}>{messages.editor.placement.precision.cancel}</button></div>}
      {notice !== undefined && <div className="notice-banner" role="alert">{notice}<button type="button" onClick={() => setNotice(undefined)} aria-label={messages.editor.dismissNotice}>×</button></div>}
      {saveState?.error === "AUTH_REQUIRED" && <div className="auth-expiry-banner" role="alert">{messages.editor.authExpired}<button type="button" onClick={onAuthRequired}>{messages.editor.loginAgain}</button></div>}
      {recoveryState !== "healthy" && <div className="auth-expiry-banner" role="alert"><span>{recoveryState === "context_lost" ? messages.editor.recovery.contextLost : recoveryState === "recovering" ? messages.editor.recovery.recovering : messages.editor.recovery.failed}</span>{recoveryState === "failed" && <button type="button" onClick={() => void recoveryRetryRef.current?.()}>{messages.editor.recovery.retry}</button>}</div>}
      <PartBrowser open={partBrowserOpen} items={partIndex} recentPartIds={recentPartIds} onClose={() => setPartBrowserOpen(false)} onSelect={(partId) => startPlacement(partId, recentPartIds.includes(partId) ? "recent" : "browser")} />
      <DevToolsShell tab={devToolsTab} onTabChange={setDevToolsTab} onValidate={handleValidate} onExportDiagnostics={handleExportDiagnostics} consistency={engine.validateEngineConsistency().valid ? messages.editor.debug.consistent : messages.editor.debug.checkRequired} performance={`FPS ${formatNumber(ui.frame.fps, 1)} · FRAME MS ${formatNumber(ui.frame.frameMs, 1)} · DPR ${quality.dpr.toFixed(2)} · ${quality.level}`} faults={faultState} onToggleFault={handleFaultToggle} enabled={import.meta.env.DEV} />
      <aside className="debug-panel" aria-label={messages.editor.debug.ariaLabel}><div className="panel-heading"><div><p className="eyebrow">{messages.editor.debug.eyebrow}</p><h2>{messages.editor.debug.heading}</h2></div><span className="panel-code">M-01</span></div><div className="metric-grid"><Metric label="FPS" value={formatNumber(ui.frame.fps, 1)} accent /><Metric label="FRAME MS" value={formatNumber(ui.frame.frameMs, 1)} /><Metric label="DRAW CALLS" value={String(ui.frame.drawCalls)} /><Metric label="INSTANCES" value={String(ui.frame.instanceCount || engine.bricks.size)} /><Metric label="SNAP MS" value={formatNumber(ui.interaction.snapTime, 2)} /><Metric label="COLLISION MS" value={formatNumber(ui.interaction.collisionTime, 2)} /></div><div className="readout-section"><div className="section-label">{messages.editor.debug.scene}</div><Readout label={messages.editor.debug.bricks} value={String(engine.bricks.size)} /><Readout label={messages.editor.debug.connections} value={String(engine.graph.size)} /><Readout label={messages.editor.debug.activeParts} value={String(engine.parts.values().length)} /><Readout label={messages.editor.debug.batches} value={String(rendererRef.current?.batches.size ?? 0)} /><Readout label={messages.editor.debug.selected} value={selectedBrick?.id ?? "—"} /><Readout label={messages.editor.debug.gesture} value={localizeInteractionState(placementSession?.state ?? ui.interactionState)} /></div><div className="readout-section candidate-readout"><div className="section-label">{messages.editor.debug.placement}</div><Readout label={messages.editor.debug.placementMode} value={localizePlacementMode(activePlacementMode)} /><Readout label={messages.editor.debug.part} value={placementSession === undefined ? selectedBrick === undefined ? "—" : localizePartName(selectedBrick.partId, selectedBrick.partId) : localizePartName(placementSession.partId, placementSession.partId)} /><Readout label={messages.editor.debug.color} value={localizeColorName(currentColor.id, currentColor.name)} /><Readout label={messages.editor.debug.target} value={candidate?.targetBrickId ?? "—"} /><Readout label={messages.editor.debug.pairs} value={candidate === undefined ? "0" : String(candidate.matchedPairs.length)} /><Readout label={messages.editor.debug.precisionSource} value={precision?.sourceConnectorId ?? "—"} /><Readout label={messages.editor.debug.precisionTarget} value={precision?.targetConnectorId ?? "—"} /><Readout label={messages.editor.debug.precisionTransform} value={precision?.preview?.result.transform === undefined ? "—" : formatTransform(precision.preview.result.transform)} /><Readout label={messages.editor.debug.matchedPairs} value={precision?.preview === undefined ? "0" : String(precision.preview.result.matchedPairs.length)} /><Readout label={messages.editor.debug.bucketDraw} value={String(bucket.getDrawIndex())} /></div><div className="readout-section"><div className="section-label">{messages.editor.debug.layers}</div><DebugToggle label={messages.editor.debug.showConnectors} active={debugFlags.connectors} onClick={() => handleDebugToggle("connectors")} /><DebugToggle label={messages.editor.debug.showColliders} active={debugFlags.colliders} onClick={() => handleDebugToggle("colliders")} /><DebugToggle label={messages.editor.debug.showCandidate} active={debugFlags.candidate} onClick={() => handleDebugToggle("candidate")} /><DebugToggle label={messages.editor.debug.showConnections} active={debugFlags.connections} onClick={() => handleDebugToggle("connections")} /><DebugToggle label={messages.editor.debug.showDragPlane} active={debugFlags.dragPlane} onClick={() => handleDebugToggle("dragPlane")} /></div></aside>
      <div className="color-palette" aria-label={messages.editor.colorPalette}><span className="section-label">{messages.editor.colorPalette}</span>{engine.colors.values().map((color) => <button key={color.id} type="button" className={`color-swatch${currentColorId === color.id ? " is-active" : ""}`} style={{ backgroundColor: color.baseColor }} aria-label={messages.editor.useColor(localizeColorName(color.id, color.name))} aria-pressed={currentColorId === color.id} onClick={() => chooseColor(color)} />)}</div>
      <div className="selection-strip" aria-live="polite"><div className="selection-swatch" style={{ backgroundColor: selectedBrick === undefined ? currentColor.baseColor : engine.colors.get(selectedBrick.colorId).baseColor }} /><div className="selection-copy"><span className="section-label">{messages.editor.selection.activeObject}</span><strong>{selectedBrick === undefined ? placementSession === undefined ? messages.editor.selection.noBrick : messages.editor.selection.placementPreview : localizePartName(selectedBrick.partId, selectedBrick.partId)}</strong></div><span className="selection-meta">{selectedBrick === undefined ? messages.editor.selection.choosePartsOrBucket : messages.editor.selection.summary(localizePartName(selectedBrick.partId, selectedBrick.partId), selectedConnections.length)}</span>{selectedBrick !== undefined && <div className="selection-actions"><button type="button" onClick={rotateSelected} aria-label={messages.editor.toolbar.rotateSelected}><RotateIcon /></button><button type="button" onClick={duplicateSelected} aria-label={`${messages.common.duplicate}${localizePartName(selectedBrick.partId, selectedBrick.partId)}`}><DuplicateIcon /></button><button type="button" onClick={deleteSelected} aria-label={`${messages.common.delete}${localizePartName(selectedBrick.partId, selectedBrick.partId)}`}><DeleteIcon /></button></div>}</div>
      <footer className="bottom-hints" aria-label={messages.editor.debug.shortcuts}><span><kbd>DRAG</kbd> {messages.editor.debug.dragHint}</span><span><kbd>R</kbd> {messages.editor.debug.rotateHint}</span><span><kbd>ALT</kbd> {messages.editor.debug.temporaryFreeHint}</span><span><kbd>ESC</kbd> {messages.editor.debug.cancelHint}</span><span className="consistency-note">{messages.editor.debug.engineState} · {engine.validateEngineConsistency().valid ? messages.editor.debug.consistent : messages.editor.debug.checkRequired}</span></footer>
    </main>
  );
};

const createPrototypeEngine = (benchmarkSize?: number, demo = false, precisionDemo = false, benchmarkLayout: "sparse" | "dense" = "sparse"): BrickEngine => {
  const engine = new BrickEngine();
  if (benchmarkSize !== undefined) {
    const partIds = ["brick-2x4", "brick-1x2", "plate-2x4", "plate-1x4", "tile-2x2"];
    for (let index = 0; index < benchmarkSize; index += 1) { const partId = partIds[index % partIds.length] ?? "brick-2x4"; const columns = benchmarkLayout === "dense" ? 50 : 25; const spacing = benchmarkLayout === "dense" ? 1.35 : 3.1; engine.createBrick({ id: `bench-${index}`, partId, colorId: index % 2 === 0 ? "blue" : "red", transform: { position: { x: (index % columns) * spacing - (columns * spacing) / 2, y: Math.floor(index / (columns * 10)) * 1.4, z: Math.floor(index / columns) * spacing - 48 }, rotation: identity() } }); }
    return engine;
  }
  if (demo) { engine.createBrick({ id: "blue-brick", partId: "brick-2x4", colorId: "blue", transform: { position: { x: -2.2, y: 0, z: 0 }, rotation: identity() } }); engine.createBrick({ id: "red-brick", partId: "brick-2x4", colorId: "red", transform: { position: { x: 2.2, y: 0, z: 0 }, rotation: identity() } }); }
  if (precisionDemo) { engine.createBrick({ id: "precision-base", partId: "brick-2x4", colorId: "blue", transform: { position: { x: 0, y: 0, z: 0 }, rotation: identity() } }); engine.createBrick({ id: "precision-moving", partId: "brick-2x4", colorId: "red", transform: { position: { x: 0, y: 1.2, z: 0 }, rotation: identity() } }); }
  return engine;
};
const readBenchmarkSize = (): number | undefined => { const value = Number(new URLSearchParams(window.location.search).get("bench")); return [100, 500, 1000, 3000, 5000].includes(value) ? value : undefined; };
const readBenchmarkLayout = (): "sparse" | "dense" => new URLSearchParams(window.location.search).get("layout") === "dense" ? "dense" : "sparse";
const readBenchmarkQuality = (): QualityLevel => { const value = new URLSearchParams(window.location.search).get("quality"); return value === "high" || value === "low" ? value : "balanced"; };
const Metric = ({ label, value, accent = false }: { label: string; value: string; accent?: boolean }): ReactElement => <div className={`metric-card${accent ? " metric-accent" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
const Readout = ({ label, value }: { label: string; value: string }): ReactElement => <div className="readout-row"><span>{label}</span><strong>{value}</strong></div>;
const DebugToggle = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): ReactElement => <button className="debug-toggle" type="button" aria-pressed={active} onClick={onClick}><span className={`toggle-box${active ? " is-active" : ""}`} aria-hidden="true">{active ? "✓" : ""}</span><span>{label}</span></button>;
const formatNumber = (value: number, digits: number): string => value === 0 ? "—" : value.toFixed(digits);
const formatTransform = (transform: Transform): string => `${transform.position.x.toFixed(2)}, ${transform.position.y.toFixed(2)}, ${transform.position.z.toFixed(2)}`;
const explicitSnapMessage = (reason: string | undefined): string => reason === "connector_occupied" ? messages.editor.placement.precision.occupied : reason === "collision" ? messages.editor.placement.precision.collision : reason === "invalid_rotation" ? messages.editor.placement.precision.invalidRotation : messages.editor.placement.precision.incompatible;
const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Thumbnail encoding failed")); reader.onerror = () => reject(reader.error ?? new Error("Thumbnail encoding failed")); reader.readAsDataURL(blob); });
const mapWithConcurrency = async <T,>(items: T[], limit: number, callback: (item: T) => Promise<void>): Promise<void> => { let cursor = 0; const worker = async (): Promise<void> => { while (cursor < items.length) { const index = cursor; cursor += 1; const item = items[index]; if (item !== undefined) await callback(item); } }; await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker())); };
const FitIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3H3v3M18 3h3v3M21 18v3h-3M3 18v3h3M8 8h8v8H8z" /></svg>;
const RotateIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4L3 9m0 0V4m0 5h5M4 13a8 8 0 0 0 14.5 4L21 15m0 0v5m0-5h-5" /></svg>;
const UndoIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 8 4 12l5 4M4 12h10a6 6 0 0 1 6 6" /></svg>;
const RedoIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 8 5 4-5 4M20 12H10a6 6 0 0 0-6 6" /></svg>;
const PartsIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z" /></svg>;
const BucketIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 11H6L5 8Zm3-3h8l1 3H7l1-3Zm-1 7h10" /></svg>;
const DuplicateIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h11v12H8zM5 16H4V4h11v1" /></svg>;
const DeleteIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg>;
