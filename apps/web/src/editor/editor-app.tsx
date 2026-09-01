import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import type { BrickProjectSnapshot, ConnectionGroup, DragResult, PrecisionSnapRequest, RotationAxis, Transform } from "../../../../src/index.js";
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
import { createPartIndex, createRuntimePartIndex, isRuntimePartIndex, mergePartIndexes, type PartIndexItem } from "./parts/part-index.js";
import { readRecentParts, recordRecentPart } from "./parts/recent-parts.js";
import type { PlacementCommit } from "./placement/placement-controller.js";
import { createPlacementSession, type NewBrickPlacementSession, type PlacementSource } from "./placement/placement-session.js";
import type { PrecisionPreviewState } from "./precision/precision-overlay.js";
import type { ThreeBrickRenderer } from "./renderer/brick-renderer.js";
import { type FrameMetrics, EditorScene } from "./scene/editor-scene.js";
import type { Plane } from "three";
import { localizeColorName, localizePartName, messageForErrorCode, messages } from "../i18n/index.js";
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
import { closeEditorPanels, openEditorPanel, type ActiveTool, type EditorPanel } from "./ui/editor-ui-state.js";

interface EditorUiState {
  activePanel: EditorPanel | null;
  debugOpen: boolean;
  snapEnabled: boolean;
  activeTool: ActiveTool;
  isMobile: boolean;
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
  sourceConnectorA1Id?: string;
  sourceConnectorA2Id?: string;
  targetConnectorB1Id?: string;
  targetConnectorB2Id?: string;
  targetBrickId?: string;
  preview?: PrecisionPreviewState;
}

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
  onRenameProject?: (name: string) => void;
  onConflict?: (localSnapshot: BrickProjectSnapshot) => void;
  onAuthRequired?: () => void;
  authEpoch?: number;
  benchmark?: boolean;
}

export const EditorApp = ({ projectId = "local-project", projectName = "Local Draft", initialSnapshot, initialNotice, recoveredDraft = false, persistence, onBackToProjects, onRenameProject, onConflict, onAuthRequired, authEpoch, benchmark = false }: EditorAppProps = {}): ReactElement => {
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
  const localPartIndex = useMemo(() => createPartIndex(engine.parts.values()), [engine]);
  const partIndex = useMemo(() => runtimePartIndex === undefined ? localPartIndex : mergePartIndexes(runtimePartIndex, localPartIndex), [localPartIndex, runtimePartIndex]);
  const bucket = useMemo(() => new BrickBucket(engine.parts.values(), { ...BASIC_BRICK_BUCKET, seedMode: "random" }), [engine]);
  const browserStorage = typeof localStorage === "undefined" ? undefined : localStorage;
  const [recentPartIds, setRecentPartIds] = useState(() => readRecentParts(browserStorage));
  const [currentColorId, setCurrentColorId] = useState("red");
  const [bucketPulse, setBucketPulse] = useState(false);
  const [bucketPhysicsSequence, setBucketPhysicsSequence] = useState(0);
  const [placementSession, setPlacementSession] = useState<NewBrickPlacementSession | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [precision, setPrecision] = useState<PrecisionEditorSession | undefined>();
  const placementNumber = useRef(1);
  const debugRequested = useMemo(() => new URLSearchParams(window.location.search).get("debug") === "1", []);
  const [ui, setUi] = useState<EditorUiState>({ activePanel: null, debugOpen: import.meta.env.DEV && debugRequested, snapEnabled: true, activeTool: "move", isMobile: typeof window !== "undefined" && window.innerWidth <= 600, selectedBrickId: undefined, hoveredBrickId: undefined, interactionState: "idle", frame: initialFrame, interaction: initialInteraction, revision: 0 });
  const [debugFlags, setDebugFlags] = useState<DebugFlags>(DEFAULT_DEBUG_FLAGS);
  const candidateRef = useRef<DragResult["candidate"]>(undefined);
  const rendererRef = useRef<ThreeBrickRenderer | null>(null);
  const debugRef = useRef<DebugVisuals | null>(null);
  const lastMetricCommit = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recoveryRetryRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const [saveState, setSaveState] = useState<SaveState | undefined>();
  const [saveDetailsOpen, setSaveDetailsOpen] = useState(false);
  const [renamingProject, setRenamingProject] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState(projectName);
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
  useEffect(() => {
    const updateViewport = (): void => setUi((current) => ({ ...current, isMobile: window.innerWidth <= 600 }));
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

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
  useEffect(() => setProjectNameDraft(projectName), [projectName]);
  useEffect(() => { if (saveState?.error === "PROJECT_CONFLICT" && !conflictNotified.current) { conflictNotified.current = true; onConflict?.(engine.getSnapshot()); } if (saveState?.error !== "PROJECT_CONFLICT") conflictNotified.current = false; }, [engine, onConflict, saveState?.error]);
  useEffect(() => { if (saveState?.error === "PROJECT_CONFLICT") telemetry.record("conflict", { count: 1 }); if (saveState?.error === "SYNC_ERROR") telemetry.record("cloud_save_failure", { status: saveState.error }); }, [saveState?.error, telemetry]);
  useEffect(() => { if (authEpoch !== undefined && authEpoch !== authEpochRef.current) { authEpochRef.current = authEpoch; void saveManager?.flushCloud(); } }, [authEpoch, saveManager]);
  const handleSelectionChange = useCallback((selectedBrickId: string | undefined) => { setUi((current) => ({ ...current, selectedBrickId })); }, []);
  const handleHoverChange = useCallback((hoveredBrickId: string | undefined) => { setUi((current) => ({ ...current, hoveredBrickId })); }, []);
  const handleStateChange = useCallback((interactionState: InteractionState) => { setUi((current) => ({ ...current, interactionState })); }, []);
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
  const handlePlacementModeChange = useCallback(() => undefined, []);
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
    if (ui.activeTool === "precision_connect") {
      setNotice(messages.editor.placement.precisionSelectionRequired);
      return;
    }
    setNotice(undefined);
    setUi((current) => ({ ...current, activePanel: null, debugOpen: false }));
    setPlacementSession(createPlacementSession(placementNumber.current++, partId, currentColorId, source));
  }, [currentColorId, ui.activeTool]);
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
  const rotateSelected = useCallback((axis: RotationAxis = "y") => { if (ui.selectedBrickId !== undefined) { engine.rotateBrick(ui.selectedBrickId, 1, axis); syncAfterCommand(); } }, [engine, syncAfterCommand, ui.selectedBrickId]);
  const clearSelection = useCallback(() => { rendererRef.current?.setSelected(undefined); setUi((current) => ({ ...current, selectedBrickId: undefined })); }, []);
  const duplicateSelected = useCallback(() => { const selected = ui.selectedBrickId === undefined ? undefined : engine.bricks.tryGet(ui.selectedBrickId); if (selected !== undefined) startPlacement(selected.partId, "duplicate"); }, [engine, startPlacement, ui.selectedBrickId]);
  const deleteSelected = useCallback(() => {
    if (ui.selectedBrickId === undefined) return;
    try { engine.deleteBrick(ui.selectedBrickId); void feedback.afterUserGesture(() => { feedback.detach(); feedback.delete(); }).catch(() => undefined); setUi((current) => ({ ...current, selectedBrickId: undefined })); syncAfterCommand(); } catch { setNotice(messages.editor.placement.cannotDelete); }
  }, [engine, feedback, syncAfterCommand, ui.selectedBrickId]);
  const chooseColor = useCallback((color: BrickColor) => { setCurrentColorId(color.id); if (ui.selectedBrickId !== undefined) { engine.changeBrickColor(ui.selectedBrickId, color.id); syncAfterCommand(); } setUi((current) => ({ ...current, activePanel: null, debugOpen: false })); }, [engine, syncAfterCommand, ui.selectedBrickId]);
  const undo = useCallback(() => { if (engine.undo()) { void feedback.afterUserGesture(() => feedback.undo()).catch(() => undefined); syncAfterCommand(); } }, [engine, feedback, syncAfterCommand]);
  const redo = useCallback(() => { if (engine.redo()) { void feedback.afterUserGesture(() => feedback.redo()).catch(() => undefined); syncAfterCommand(); } }, [engine, feedback, syncAfterCommand]);

  const requestActiveTool = useCallback((tool: ActiveTool) => {
    if (tool === "precision_connect") {
      if (ui.selectedBrickId === undefined) {
        setNotice(messages.editor.placement.precisionSelectionRequired);
        return;
      }
      setNotice(undefined);
      setUi((current) => ({ ...current, activeTool: tool, activePanel: null, debugOpen: false }));
      setPrecision({ movingBrickId: ui.selectedBrickId, state: "precision_pick_source_a1" });
      return;
    }
    setPrecision(undefined);
    setUi((current) => ({ ...current, activeTool: "move" }));
    setNotice(undefined);
  }, [ui.selectedBrickId]);

  const togglePanel = useCallback((panel: EditorPanel): void => {
    setUi((current) => {
      const isOpen = panel === "debug" ? current.debugOpen : current.activePanel === panel;
      return { ...current, ...(isOpen ? closeEditorPanels() : openEditorPanel(current, panel)) };
    });
  }, []);

  const closePanels = useCallback((): void => { setUi((current) => ({ ...current, ...closeEditorPanels() })); }, []);

  const handlePrecisionSourceA1 = useCallback((sourceConnectorA1Id: string) => {
    setNotice(undefined);
    setPrecision((current) => current === undefined ? current : {
      movingBrickId: current.movingBrickId,
      state: "precision_pick_source_a2",
      sourceConnectorA1Id
    });
  }, []);

  const handlePrecisionSourceA2 = useCallback((sourceConnectorA2Id: string) => {
    setNotice(undefined);
    setPrecision((current) => current === undefined || current.sourceConnectorA1Id === undefined ? current : {
      movingBrickId: current.movingBrickId,
      state: "precision_pick_target_b1",
      sourceConnectorA1Id: current.sourceConnectorA1Id,
      sourceConnectorA2Id
    });
  }, []);

  const handlePrecisionTargetB1 = useCallback((targetConnectorB1Id: string, targetBrickId: string) => {
    setNotice(undefined);
    setPrecision((current) => current === undefined || current.sourceConnectorA1Id === undefined || current.sourceConnectorA2Id === undefined ? current : {
      movingBrickId: current.movingBrickId,
      state: "precision_pick_target_b2",
      sourceConnectorA1Id: current.sourceConnectorA1Id,
      sourceConnectorA2Id: current.sourceConnectorA2Id,
      targetConnectorB1Id,
      targetBrickId
    });
  }, []);

  const handlePrecisionTargetB2 = useCallback((targetConnectorB2Id: string, targetBrickId: string) => {
    const current = precision;
    if (current === undefined || current.sourceConnectorA1Id === undefined || current.sourceConnectorA2Id === undefined || current.targetConnectorB1Id === undefined) {
      return;
    }
    const movingBrick = engine.bricks.tryGet(current.movingBrickId);
    if (movingBrick === undefined) {
      setNotice(messages.editor.placement.brickUnavailable);
      return;
    }
    const request: PrecisionSnapRequest = {
      movingBrickId: current.movingBrickId,
      movingConnectorA1Id: current.sourceConnectorA1Id,
      movingConnectorA2Id: current.sourceConnectorA2Id,
      targetBrickId,
      targetConnectorB1Id: current.targetConnectorB1Id,
      targetConnectorB2Id,
      freeTransform: movingBrick.transform
    };
    const result = engine.solvePrecisionSnap(request);
    if (!result.valid || result.transform === undefined) {
      setNotice(explicitSnapMessage(result.reason));
      return;
    }
    setNotice(undefined);
    setPrecision({
      movingBrickId: current.movingBrickId,
      state: "precision_preview",
      sourceConnectorA1Id: current.sourceConnectorA1Id,
      sourceConnectorA2Id: current.sourceConnectorA2Id,
      targetConnectorB1Id: current.targetConnectorB1Id,
      targetConnectorB2Id,
      targetBrickId,
      preview: { request, result }
    });
  }, [engine, precision]);

  const handlePrecisionCancel = useCallback(() => {
    setNotice(undefined);
    setPrecision(undefined);
    setUi((current) => ({ ...current, activeTool: "move" }));
  }, []);

  const handlePrecisionConfirm = useCallback(() => {
    const preview = precision?.preview;
    if (preview === undefined) {
      return;
    }
    try {
      const result = engine.commitPrecisionSnap(preview.request);
      setUi((current) => ({ ...current, selectedBrickId: preview.request.movingBrickId }));
      syncAfterCommand();
      setNotice(messages.editor.placement.connected(result.matchedPairs.length));
      setPrecision(undefined);
      setUi((current) => ({ ...current, activeTool: "move" }));
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
  const saveStatus = saveState === undefined ? messages.editor.status.local : saveState.saving ? messages.editor.status.saving : saveState.error !== undefined ? messageForErrorCode(saveState.error) : saveState.dirty ? messages.editor.status.draftSaved : messages.editor.status.saved;
  const rendererOptions = useMemo(() => ({ shouldFailNextAssetLoad: () => faults.consume("failNextAssetLoad"), onAssetFailure: (partId: string) => telemetry.record("asset_failure", { partId }) }), [faults, telemetry]);
  const saveLocal = useCallback(() => saveManager?.flushLocal(), [saveManager]);
  const saveTone = saveState?.error !== undefined ? "is-error" : saveState?.saving === true ? "is-saving" : saveState?.offline === true ? "is-offline" : "is-saved";
  const displayedProjectName = projectNameDraft.trim() === "" ? projectName : projectNameDraft;
  const commitProjectRename = (): void => {
    const nextName = projectNameDraft.trim();
    if (nextName.length === 0 || nextName === projectName || onRenameProject === undefined) {
      setProjectNameDraft(projectName);
      setRenamingProject(false);
      return;
    }
    onRenameProject(nextName);
    setProjectNameDraft(nextName);
    setRenamingProject(false);
  };

  return (
    <main className="editor-shell" {...(benchmark ? { "data-benchmark-ready": "true", "data-benchmark-size": String(benchmarkSize ?? 0), "data-benchmark-fps": ui.frame.fps.toFixed(3), "data-benchmark-frame-ms": ui.frame.frameMs.toFixed(3), "data-benchmark-draw-calls": String(ui.frame.drawCalls), "data-benchmark-instances": String(ui.frame.instanceCount), "data-benchmark-triangles": String(ui.frame.triangles), "data-benchmark-batches": String(rendererRef.current?.batches.size ?? 0), "data-benchmark-chunks": String(rendererRef.current?.getChunkCount() ?? 0), "data-benchmark-quality": quality.level, "data-benchmark-dpr": quality.dpr.toFixed(2) } : {})}>
      <header className="top-rail">
        <div className="editor-breadcrumb">
          {onBackToProjects !== undefined && <button className="back-link" type="button" onClick={onBackToProjects} aria-label={messages.editor.toolbar.backToBuilds}><BackIcon /><span>{messages.editor.toolbar.backToBuilds}</span></button>}
          <span className="breadcrumb-divider" aria-hidden="true">/</span>
          {renamingProject ? <input className="project-name-input" value={projectNameDraft} onChange={(event) => setProjectNameDraft(event.target.value)} onBlur={commitProjectRename} onKeyDown={(event) => { if (event.key === "Enter") commitProjectRename(); if (event.key === "Escape") { setProjectNameDraft(projectName); setRenamingProject(false); } }} aria-label={messages.builds.projectName} autoFocus maxLength={80} /> : <button className="project-name-button" type="button" onClick={() => onRenameProject !== undefined && setRenamingProject(true)} disabled={onRenameProject === undefined}>{displayedProjectName}</button>}
        </div>
        <div className="save-status-wrap">
          <button className={`save-status ${saveTone}`} type="button" onClick={() => setSaveDetailsOpen((open) => !open)} aria-expanded={saveDetailsOpen} aria-label={saveStatus}><span className="status-dot" aria-hidden="true" /><span>{saveStatus}</span></button>
          {saveDetailsOpen && <div className="save-details" role="status"><strong>{saveStatus}</strong><span>{saveState?.offline === true ? messages.editor.status.offlineDescription : saveState?.dirty === true ? messages.editor.status.localDescription : messages.editor.status.savedDescription}</span><button type="button" onClick={() => setSaveDetailsOpen(false)}>{messages.common.close}</button></div>}
        </div>
        <div className="top-actions">
          <button className="icon-button" type="button" onClick={undo} disabled={!history.canUndo || placementSession !== undefined || precision !== undefined} aria-label={messages.editor.toolbar.undo}><UndoIcon /></button>
          <button className="icon-button" type="button" onClick={redo} disabled={!history.canRedo || placementSession !== undefined || precision !== undefined} aria-label={messages.editor.toolbar.redo}><RedoIcon /></button>
          <button className="icon-button" type="button" onClick={() => cameraController.fitProject()} aria-label={messages.editor.toolbar.fitProject}><FitIcon /></button>
          <button className="icon-button" type="button" onClick={() => togglePanel("settings")} aria-expanded={ui.activePanel === "settings"} aria-label={messages.editor.toolbar.more}><MoreIcon /></button>
        </div>
      </header>
      <nav className="tool-rail" aria-label={messages.editor.toolbar.tools}>
        <ToolRailButton icon={<MoveIcon />} label={messages.editor.toolbar.move} active={ui.activeTool === "move"} onClick={() => requestActiveTool("move")} />
        <ToolRailButton icon={<PartsIcon />} label={messages.editor.toolbar.parts} active={ui.activePanel === "parts"} onClick={() => togglePanel("parts")} />
        <ToolRailButton icon={<BucketIcon />} label={messages.editor.toolbar.bucket} active={ui.activePanel === "bucket"} onClick={() => togglePanel("bucket")} />
        <ToolRailButton icon={<ColorIcon />} label={messages.editor.toolbar.color} active={ui.activePanel === "color"} onClick={() => togglePanel("color")} />
        <ToolRailButton icon={<PrecisionIcon />} label={messages.editor.toolbar.precisionConnect} active={ui.activeTool === "precision_connect"} disabled={selectedBrick === undefined} onClick={() => requestActiveTool(ui.activeTool === "precision_connect" ? "move" : "precision_connect")} />
        <ToolRailButton icon={<MoreIcon />} label={messages.editor.toolbar.settings} active={ui.activePanel === "settings"} onClick={() => togglePanel("settings")} />
        <div className="rail-divider" />
        <button className={`snap-toggle${ui.snapEnabled ? " is-active" : ""}`} type="button" role="switch" aria-checked={ui.snapEnabled} onClick={() => setUi((current) => ({ ...current, snapEnabled: !current.snapEnabled }))}><span className="snap-icon" aria-hidden="true"><MagnetIcon /></span><span>{messages.editor.toolbar.snap}</span><strong>{ui.snapEnabled ? messages.common.on : messages.common.off}</strong></button>
        <span className="rail-shortcut"><kbd>Alt</kbd><span>{messages.editor.toolbar.altHint}</span></span>
      </nav>
      <section className="scene-wrap" aria-label={messages.editor.sceneAria}><EditorScene engine={engine} cameraController={cameraController} debugFlags={debugFlags} quality={quality} benchmark={benchmark} {...(physics === undefined ? {} : { physics })} rendererOptions={rendererOptions} selectedBrickId={ui.selectedBrickId} placementSession={placementSession} placementMode={ui.snapEnabled ? "auto" : "free"} precision={precision === undefined ? undefined : { movingBrickId: precision.movingBrickId, state: precision.state, ...(precision.sourceConnectorA1Id === undefined ? {} : { sourceConnectorA1Id: precision.sourceConnectorA1Id }), ...(precision.sourceConnectorA2Id === undefined ? {} : { sourceConnectorA2Id: precision.sourceConnectorA2Id }), ...(precision.targetConnectorB1Id === undefined ? {} : { targetConnectorB1Id: precision.targetConnectorB1Id }), ...(precision.targetConnectorB2Id === undefined ? {} : { targetConnectorB2Id: precision.targetConnectorB2Id }), ...(precision.targetBrickId === undefined ? {} : { targetBrickId: precision.targetBrickId }), ...(precision.preview === undefined ? {} : { preview: precision.preview }), onSourceConnectorA1: handlePrecisionSourceA1, onSourceConnectorA2: handlePrecisionSourceA2, onTargetConnectorB1: handlePrecisionTargetB1, onTargetConnectorB2: handlePrecisionTargetB2 }} onSelectionChange={handleSelectionChange} onHoverChange={handleHoverChange} onStateChange={handleStateChange} onDragResult={handleDragResult} onDragPlaneChange={handleDragPlaneChange} onInteractionMetricsChange={handleInteractionMetricsChange} onHistoryChange={bumpRevision} onFrameMetrics={handleFrameMetrics} onRendererReady={handleRendererReady} onDebugReady={handleDebugReady} onPlacementCommitted={handlePlacementCommitted} onPlacementCancelled={handlePlacementCancelled} onPlacementModeChange={handlePlacementModeChange} onCanvasReady={handleCanvasReady} onRecoveryStateChange={handleRecoveryStateChange} onRecoveryRetryReady={handleRecoveryRetryReady} saveLocal={saveLocal} /></section>
      {engine.bricks.size === 0 && placementSession === undefined && precision === undefined && <EmptyEditorPrompt onParts={() => togglePanel("parts")} onBucket={() => togglePanel("bucket")} />}
      {placementSession !== undefined && <div className="context-notice placement-notice" role="status"><strong>{messages.editor.placement.placePart(localizePartName(placementSession.partId, engine.parts.get(placementSession.partId).name))}</strong><span>{messages.editor.placement.dragHint}</span><button type="button" onClick={handlePlacementCancelled}>{messages.common.cancel}</button></div>}
      {precision !== undefined && <div className="context-notice precision-notice" role="status"><strong>{precision.state === "precision_pick_source_a1" ? messages.editor.placement.precision.pickSourceA1 : precision.state === "precision_pick_source_a2" ? messages.editor.placement.precision.pickSourceA2 : precision.state === "precision_pick_target_b1" ? messages.editor.placement.precision.pickTargetB1 : precision.state === "precision_pick_target_b2" ? messages.editor.placement.precision.pickTargetB2 : messages.editor.placement.precision.preview}</strong><span>{precision.state === "precision_preview" ? messages.editor.placement.precision.pairCount(precision.preview?.result.matchedPairs.length ?? 0) : messages.editor.placement.precision.hint}</span>{precision.state === "precision_preview" && <button className="primary-action" type="button" onClick={handlePrecisionConfirm}>{messages.editor.placement.precision.confirm}</button>}<button type="button" onClick={handlePrecisionCancel}>{messages.editor.placement.precision.cancel}</button></div>}
      {notice !== undefined && <div className="toast-notice" role="alert">{notice}<button type="button" onClick={() => setNotice(undefined)} aria-label={messages.editor.dismissNotice}>×</button></div>}
      {saveState?.error === "AUTH_REQUIRED" && <div className="auth-expiry-banner" role="alert">{messages.editor.authExpired}<button type="button" onClick={onAuthRequired}>{messages.editor.loginAgain}</button></div>}
      {recoveryState !== "healthy" && <div className="auth-expiry-banner" role="alert"><span>{recoveryState === "context_lost" ? messages.editor.recovery.contextLost : recoveryState === "recovering" ? messages.editor.recovery.recovering : messages.editor.recovery.failed}</span>{recoveryState === "failed" && <button type="button" onClick={() => void recoveryRetryRef.current?.()}>{messages.editor.recovery.retry}</button>}</div>}
      <PartBrowser open={ui.activePanel === "parts"} items={partIndex} recentPartIds={recentPartIds} onClose={closePanels} onSelect={(partId) => startPlacement(partId, recentPartIds.includes(partId) ? "recent" : "browser")} />
      {ui.activePanel === "bucket" && <BucketPanel pulse={bucketPulse} onDraw={handleBucketDraw} onClose={closePanels} />}
      {ui.activePanel === "color" && <ColorPanel colors={engine.colors.values()} currentColorId={currentColorId} onChoose={chooseColor} onClose={closePanels} />}
      {ui.activePanel === "settings" && <SettingsPanel snapEnabled={ui.snapEnabled} onSnapChange={(enabled) => setUi((current) => ({ ...current, snapEnabled: enabled }))} onOpenDebug={() => togglePanel("debug")} onClose={closePanels} debugAvailable={import.meta.env.DEV} />}
      <DevToolsShell open={ui.debugOpen} tab={devToolsTab} onTabChange={setDevToolsTab} onClose={closePanels} onValidate={handleValidate} onExportDiagnostics={handleExportDiagnostics} consistency={engine.validateEngineConsistency().valid ? messages.editor.debug.consistent : messages.editor.debug.checkRequired} performance={`FPS ${formatNumber(ui.frame.fps, 1)} · FRAME MS ${formatNumber(ui.frame.frameMs, 1)} · DPR ${quality.dpr.toFixed(2)} · ${quality.level}`} faults={faultState} onToggleFault={handleFaultToggle} enabled={import.meta.env.DEV} metrics={{ frame: ui.frame, interaction: ui.interaction, brickCount: engine.bricks.size, connectionCount: engine.graph.size, selected: selectedBrick?.id, candidatePairs: candidate?.matchedPairs.length, matchedPairs: precision?.preview?.result.matchedPairs.length }} debugFlags={debugFlags} onToggleDebug={handleDebugToggle} />
      {selectedBrick !== undefined && <div className="context-toolbar" aria-live="polite"><div className="selection-swatch" style={{ backgroundColor: engine.colors.get(selectedBrick.colorId).baseColor }} /><div className="selection-copy"><span>{messages.editor.selection.activeObject}</span><strong>{localizePartName(selectedBrick.partId, selectedBrick.partId)}</strong></div><span className="selection-meta">{messages.editor.selection.summary(localizePartName(selectedBrick.partId, selectedBrick.partId), selectedConnections.length)}</span><div className="selection-actions"><button type="button" onClick={() => rotateSelected("y")} aria-label={messages.editor.toolbar.rotateSelected}><RotateIcon /></button><button type="button" onClick={() => rotateSelected("x")} aria-label={messages.editor.toolbar.rotateSelectedVertical}><VerticalRotateIcon /></button><button type="button" onClick={duplicateSelected} aria-label={`${messages.common.duplicate}${localizePartName(selectedBrick.partId, selectedBrick.partId)}`}><DuplicateIcon /></button><button type="button" onClick={() => requestActiveTool("precision_connect")} aria-label={messages.editor.toolbar.precisionConnect}><PrecisionIcon /></button><button type="button" onClick={deleteSelected} aria-label={`${messages.common.delete}${localizePartName(selectedBrick.partId, selectedBrick.partId)}`}><DeleteIcon /></button><button type="button" onClick={clearSelection} aria-label={messages.editor.toolbar.clearSelection}><ClearSelectionIcon /></button></div></div>}
      <div className="mobile-tool-bar" aria-label={messages.editor.toolbar.tools}><ToolRailButton icon={<MoveIcon />} label={messages.editor.toolbar.move} active={ui.activeTool === "move"} onClick={() => requestActiveTool("move")} /><ToolRailButton icon={<PartsIcon />} label={messages.editor.toolbar.parts} active={ui.activePanel === "parts"} onClick={() => togglePanel("parts")} /><ToolRailButton icon={<BucketIcon />} label={messages.editor.toolbar.bucket} active={ui.activePanel === "bucket"} onClick={() => togglePanel("bucket")} /><ToolRailButton icon={<ColorIcon />} label={messages.editor.toolbar.color} active={ui.activePanel === "color"} onClick={() => togglePanel("color")} /><ToolRailButton icon={<PrecisionIcon />} label={messages.editor.toolbar.precisionConnect} active={ui.activeTool === "precision_connect"} disabled={selectedBrick === undefined} onClick={() => requestActiveTool(ui.activeTool === "precision_connect" ? "move" : "precision_connect")} /><ToolRailButton icon={<MoreIcon />} label={messages.editor.toolbar.settings} active={ui.activePanel === "settings"} onClick={() => togglePanel("settings")} /></div>
      <footer className="bottom-hints" aria-label={messages.editor.debug.shortcuts}><span><kbd>DRAG</kbd> {messages.editor.debug.dragHint}</span><span><kbd>R</kbd> {messages.editor.debug.rotateHint}</span><span><kbd>SHIFT+R</kbd> {messages.editor.toolbar.rotateSelectedVertical}</span><span><kbd>WASD</kbd> {messages.editor.debug.cameraMoveHint}</span><span><kbd>ALT</kbd> {messages.editor.toolbar.altHint}</span><span><kbd>ESC</kbd> {messages.editor.debug.cancelHint}</span></footer>
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
interface ToolRailButtonProps { icon: ReactElement; label: string; active: boolean; disabled?: boolean; onClick: () => void; }
const ToolRailButton = ({ icon, label, active, disabled = false, onClick }: ToolRailButtonProps): ReactElement => <button className={`tool-rail-button${active ? " is-active" : ""}`} type="button" aria-pressed={active} aria-label={label} disabled={disabled} onClick={onClick}>{icon}<span>{label}</span></button>;

interface BucketPanelProps { pulse: boolean; onDraw: () => void; onClose: () => void; }
const BucketPanel = ({ pulse, onDraw, onClose }: BucketPanelProps): ReactElement => <aside className="editor-drawer left-drawer bucket-drawer" aria-label={messages.editor.toolbar.bucket}><PanelHeader title={messages.editor.panels.bucketTitle} onClose={onClose} /><p>{messages.editor.panels.bucketDescription}</p><button className={`bucket-draw-action${pulse ? " is-shaking" : ""}`} type="button" onClick={onDraw}><BucketIcon /><span>{messages.editor.toolbar.drawFromBucket}</span></button><p className="panel-hint">{messages.editor.placement.dragHint}</p></aside>;

interface ColorPanelProps { colors: BrickColor[]; currentColorId: string; onChoose: (color: BrickColor) => void; onClose: () => void; }
const ColorPanel = ({ colors, currentColorId, onChoose, onClose }: ColorPanelProps): ReactElement => <aside className="editor-drawer left-drawer color-drawer" aria-label={messages.editor.colorPalette}><PanelHeader title={messages.editor.panels.colorTitle} onClose={onClose} /><p>{messages.editor.panels.colorDescription}</p><div className="color-grid">{colors.map((color) => <button key={color.id} type="button" className={`color-choice${currentColorId === color.id ? " is-active" : ""}`} style={{ "--swatch": color.baseColor } as CSSProperties} aria-label={messages.editor.useColor(localizeColorName(color.id, color.name))} aria-pressed={currentColorId === color.id} onClick={() => onChoose(color)}><span className="color-choice-swatch" aria-hidden="true" /><span>{localizeColorName(color.id, color.name)}</span></button>)}</div></aside>;

interface SettingsPanelProps { snapEnabled: boolean; onSnapChange: (enabled: boolean) => void; onOpenDebug: () => void; onClose: () => void; debugAvailable: boolean; }
const SettingsPanel = ({ snapEnabled, onSnapChange, onOpenDebug, onClose, debugAvailable }: SettingsPanelProps): ReactElement => <aside className="editor-drawer left-drawer settings-drawer" aria-label={messages.editor.toolbar.settings}><PanelHeader title={messages.editor.panels.settingsTitle} onClose={onClose} /><div className="settings-group"><span className="settings-label">{messages.editor.toolbar.snap}</span><button className="settings-switch" type="button" role="switch" aria-checked={snapEnabled} onClick={() => onSnapChange(!snapEnabled)}><span>{snapEnabled ? messages.common.on : messages.common.off}</span><span className="switch-track" aria-hidden="true"><span /></span></button><p>{messages.editor.panels.snapDescription}</p></div>{debugAvailable && <button className="drawer-link" type="button" onClick={onOpenDebug}>{messages.editor.panels.openDebug}</button>}</aside>;

const EmptyEditorPrompt = ({ onParts, onBucket }: { onParts: () => void; onBucket: () => void }): ReactElement => <div className="empty-editor-prompt"><div className="empty-editor-mark" aria-hidden="true"><span /><span /><span /></div><h2>{messages.editor.empty.title}</h2><p>{messages.editor.empty.description}</p><div><button className="primary-action" type="button" onClick={onParts}>{messages.editor.empty.openParts}</button><button className="secondary-action" type="button" onClick={onBucket}>{messages.editor.empty.openBucket}</button></div></div>;

const PanelHeader = ({ title, onClose }: { title: string; onClose: () => void }): ReactElement => <div className="drawer-header"><h2>{title}</h2><button className="drawer-close" type="button" onClick={onClose} aria-label={messages.common.close}>×</button></div>;

const formatNumber = (value: number, digits: number): string => value === 0 ? "—" : value.toFixed(digits);
const explicitSnapMessage = (reason: string | undefined): string => reason === "connector_occupied" ? messages.editor.placement.precision.occupied : reason === "collision" ? messages.editor.placement.precision.collision : reason === "invalid_rotation" ? messages.editor.placement.precision.invalidRotation : reason === "below_ground" ? messages.editor.placement.precision.belowGround : messages.editor.placement.precision.incompatible;
const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Thumbnail encoding failed")); reader.onerror = () => reject(reader.error ?? new Error("Thumbnail encoding failed")); reader.readAsDataURL(blob); });
const mapWithConcurrency = async <T,>(items: T[], limit: number, callback: (item: T) => Promise<void>): Promise<void> => { let cursor = 0; const worker = async (): Promise<void> => { while (cursor < items.length) { const index = cursor; cursor += 1; const item = items[index]; if (item !== undefined) await callback(item); } }; await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker())); };
const FitIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3H3v3M18 3h3v3M21 18v3h-3M3 18v3h3M8 8h8v8H8z" /></svg>;
const BackIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7M7 12h13" /></svg>;
const RotateIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4L3 9m0 0V4m0 5h5M4 13a8 8 0 0 0 14.5 4L21 15m0 0v5m0-5h-5" /></svg>;
const VerticalRotateIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7a5 5 0 0 1 8.5 3.5M16 17a5 5 0 0 1-8.5-3.5M16.5 5v5h-5M7.5 19v-5h5" /></svg>;
const UndoIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 8 4 12l5 4M4 12h10a6 6 0 0 1 6 6" /></svg>;
const RedoIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 8 5 4-5 4M20 12H10a6 6 0 0 0-6 6" /></svg>;
const PartsIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z" /></svg>;
const MoveIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3m3-3 3 3M12 21l-3-3m3 3 3-3M3 12l3-3m-3 3 3 3M21 12l-3-3m3 3-3 3" /></svg>;
const BucketIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 11H6L5 8Zm3-3h8l1 3H7l1-3Zm-1 7h10" /></svg>;
const ColorIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 0 0 16h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h3a5 5 0 0 0 0-10h-3Z" /><path d="M7.5 9.5h.01M9.5 6.5h.01M15.5 6.5h.01" /></svg>;
const PrecisionIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h5M5 5v5M19 19h-5M19 19v-5M8 8l8 8M16 8h3v3M8 16H5v-3" /></svg>;
const MoreIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01" /></svg>;
const MagnetIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v7a7 7 0 0 0 14 0V5M5 5h4v7a3 3 0 0 0 6 0V5h4M5 5v3h4M15 5v3h4" /></svg>;
const DuplicateIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h11v12H8zM5 16H4V4h11v1" /></svg>;
const DeleteIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg>;
const ClearSelectionIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>;
