import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MathUtils } from "three";
import type { Camera, GridHelper, Group, LineBasicMaterial, PerspectiveCamera, Plane, Scene } from "three";
import type { ReactElement, Ref } from "react";
import { useEffect, useRef, useState } from "react";
import type { BrickEngine, DragResult, PlacementMode, Transform } from "../../../../../src/index.js";
import type { ThreeCameraController, OrbitControlsLike } from "../camera/camera-controller.js";
import { InteractionController, type InteractionMetrics, type InteractionState } from "../interaction/interaction-controller.js";
import { ThreeBrickRenderer } from "../renderer/brick-renderer.js";
import { DebugVisuals } from "../debug/debug-visuals.js";
import type { DebugFlags } from "../debug/debug-visuals.js";
import { PlacementController, type PlacementCommit } from "../placement/placement-controller.js";
import type { NewBrickPlacementSession } from "../placement/placement-session.js";
import { PrecisionOverlay, type PrecisionOverlayProps } from "../precision/precision-overlay.js";
import { FrameCoordinator } from "../performance/frame-coordinator.js";
import type { QualitySettings } from "../performance/quality-manager.js";
import { WebGLRecoveryController, type WebGLRecoveryState } from "../recovery/webgl-recovery-controller.js";
import type { ThreeBrickRendererOptions } from "../renderer/brick-renderer.js";
import type { BucketPhysicsSession } from "../physics/bucket-physics.js";

const INFINITE_GROUND_SIZE = 32_768;
const INFINITE_GROUND_FOLLOW_STEP = 4_096;
const NEAR_GRID_SIZE = 256;
const NEAR_GRID_DIVISIONS = 256;
const FAR_GRID_SIZE = 8_192;
const FAR_GRID_DIVISIONS = 128;

export interface FrameMetrics {
  fps: number;
  frameMs: number;
  drawCalls: number;
  instanceCount: number;
  visibleInstanceCount: number;
  triangles: number;
}

export interface EditorSceneProps {
  engine: BrickEngine;
  cameraController: ThreeCameraController;
  onSelectionChange: (brickId: string | undefined) => void;
  onHoverChange: (brickId: string | undefined) => void;
  onStateChange: (state: InteractionState) => void;
  onDragResult: (freeTransform: Transform, result: DragResult) => void;
  onDragPlaneChange: (plane: Plane | undefined) => void;
  onInteractionMetricsChange: (metrics: InteractionMetrics) => void;
  onHistoryChange: () => void;
  onFrameMetrics: (metrics: FrameMetrics) => void;
  onRendererReady: (renderer: ThreeBrickRenderer) => void;
  onDebugReady: (debug: DebugVisuals) => void;
  debugFlags: DebugFlags;
  selectedBrickId?: string | undefined;
  placementSession?: NewBrickPlacementSession | undefined;
  onPlacementCommitted: (commit: PlacementCommit) => void;
  onPlacementCancelled: () => void;
  placementMode: PlacementMode;
  onPlacementModeChange: (mode: PlacementMode) => void;
  precision: Omit<PrecisionOverlayProps, "engine"> | undefined;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  quality?: QualitySettings;
  onRecoveryStateChange?: (state: WebGLRecoveryState) => void;
  saveLocal?: () => Promise<void> | void;
  onRecoveryRetryReady?: (retry: () => Promise<void>) => void;
  rendererOptions?: ThreeBrickRendererOptions;
  physics?: BucketPhysicsSession;
  benchmark?: boolean;
}

export const EditorScene = (props: EditorSceneProps): ReactElement => (
  <Canvas
    frameloop="demand"
    shadows={(props.quality?.shadows ?? true) && props.engine.bricks.size < 1000}
    dpr={props.quality?.dpr ?? [1, 1.5]}
    camera={{ position: [0, 2.2, 10], fov: 42, near: 0.1, far: 20_000 }}
    gl={{ antialias: true, powerPreference: "high-performance" }}
  >
    <SceneRuntime {...props} />
  </Canvas>
);

const SceneRuntime = (props: EditorSceneProps): ReactElement => {
  const { camera, gl, scene, invalidate } = useThree();
  const groupRef = useRef<Group>(null);
  const controlsRef = useRef<OrbitControlsLike | null>(null);
  const [renderer, setRenderer] = useState<ThreeBrickRenderer | null>(null);
  const [debug, setDebug] = useState<DebugVisuals | null>(null);
  const interactionRef = useRef<InteractionController | null>(null);
  const placementRef = useRef<PlacementController | null>(null);
  const frameAccumulator = useRef({ elapsed: 0, frames: 0 });
  const frameCoordinator = useRef(new FrameCoordinator(props.benchmark === true ? "continuous" : "demand"));

  useEffect(() => { props.onCanvasReady?.(gl.domElement); }, [gl.domElement, props.onCanvasReady]);

  useEffect(() => {
    if (groupRef.current === null) {
      return;
    }
    const nextRenderer = new ThreeBrickRenderer(groupRef.current, props.engine, 256, props.engine.colors, props.rendererOptions);
    nextRenderer.syncFromEngine();
    frameCoordinator.current.requestFrame();
    const nextDebug = new DebugVisuals(scene as unknown as Scene, props.engine);
    setRenderer(nextRenderer);
    setDebug(nextDebug);
    props.onRendererReady(nextRenderer);
    props.onDebugReady(nextDebug);
    return () => {
      nextDebug.dispose();
      nextRenderer.dispose();
      setRenderer(null);
      setDebug(null);
    };
  }, [props.engine, props.onDebugReady, props.onRendererReady, props.rendererOptions, scene]);

  useEffect(() => { const unsubscribe = frameCoordinator.current.subscribe(invalidate); frameCoordinator.current.requestFrame(); return unsubscribe; }, [invalidate]);
  useEffect(() => {
    const request = (): void => frameCoordinator.current.requestFrame();
    const events: Array<[EventTarget, string]> = [[gl.domElement, "pointerdown"], [gl.domElement, "pointermove"], [gl.domElement, "pointerup"], [gl.domElement, "pointercancel"], [gl.domElement, "wheel"], [document, "keydown"], [document, "keyup"]];
    for (const [target, type] of events) target.addEventListener(type, request);
    return () => { for (const [target, type] of events) target.removeEventListener(type, request); };
  }, [gl.domElement]);

  useEffect(() => {
    if (props.onRecoveryStateChange === undefined || props.saveLocal === undefined) return;
    const recovery = new WebGLRecoveryController(gl.domElement, {
      saveLocal: props.saveLocal,
      pause: () => frameCoordinator.current.pause(),
      resume: () => frameCoordinator.current.resume(),
      recreate: () => { renderer?.syncFromEngine(); debug?.update(); },
      onStateChange: props.onRecoveryStateChange
    });
    props.onRecoveryRetryReady?.(() => recovery.recover());
    return recovery.attach();
  }, [debug, gl.domElement, props.onRecoveryRetryReady, props.onRecoveryStateChange, props.saveLocal, renderer]);

  useEffect(() => {
    if (controlsRef.current !== null) {
      props.cameraController.attach(camera as unknown as PerspectiveCamera, controlsRef.current);
    }
  }, [camera, props.cameraController]);

  useEffect(() => {
    debug?.setFlags(props.debugFlags);
  }, [debug, props.debugFlags]);

  useEffect(() => {
    if (renderer === null) {
      return;
    }
    const interaction = new InteractionController({
      engine: props.engine,
      renderer,
      camera: camera as unknown as PerspectiveCamera,
      cameraController: props.cameraController,
      element: gl.domElement,
      onSelectionChange: (brickId) => {
        renderer.setSelected(brickId);
        props.onSelectionChange(brickId);
      },
      onHoverChange: (brickId) => {
        renderer.setHovered(brickId);
        props.onHoverChange(brickId);
      },
      onStateChange: props.onStateChange,
      onDragResult: (freeTransform, result) => {
        debug?.setCandidate(result.candidate);
        debug?.update();
        props.onDragResult(freeTransform, result);
      },
      onDragPlaneChange: (plane: Plane | undefined) => {
        debug?.setDragPlane(plane);
        if (plane === undefined) {
          debug?.setCandidate(undefined);
        }
        debug?.update();
        props.onDragPlaneChange(plane);
      },
      onMetricsChange: props.onInteractionMetricsChange,
      onHistoryChange: () => {
        renderer.syncFromEngine();
        debug?.update();
        props.onHistoryChange();
        frameCoordinator.current.requestFrame();
      },
      placementMode: props.placementMode,
      onPlacementModeChange: props.onPlacementModeChange
    });
    interactionRef.current = interaction;
    interaction.setSelectedBrickId(props.selectedBrickId);
    interaction.setEnabled(props.placementSession === undefined);
    const removeKeyboard = interaction.attachKeyboard(document);
    const placement = props.placementSession === undefined ? undefined : new PlacementController({
      engine: props.engine,
      renderer,
      camera: camera as unknown as PerspectiveCamera,
      cameraController: props.cameraController,
      element: gl.domElement,
      session: props.placementSession,
      onStateChange: () => undefined,
      onDragResult: (freeTransform, result) => {
        debug?.setCandidate(result.candidate);
        debug?.update();
        props.onDragResult(freeTransform, result);
      },
      onDragPlaneChange: (plane: Plane | undefined) => {
        debug?.setDragPlane(plane);
        if (plane === undefined) {
          debug?.setCandidate(undefined);
        }
        debug?.update();
        props.onDragPlaneChange(plane);
      },
      onMetricsChange: props.onInteractionMetricsChange,
      onCommit: (commit) => { props.onPlacementCommitted(commit); frameCoordinator.current.requestFrame(); },
      onCancel: () => { props.onPlacementCancelled(); frameCoordinator.current.requestFrame(); },
      placementMode: props.placementMode,
      onPlacementModeChange: props.onPlacementModeChange
    });
    placementRef.current = placement ?? null;
    interaction.setPrecisionState(props.precision?.state);
    const removePlacementKeyboard = placement?.attachKeyboard(document);
    return () => {
      removePlacementKeyboard?.();
      placement?.dispose();
      removeKeyboard();
      interaction.dispose();
      interactionRef.current = null;
      placementRef.current = null;
    };
  }, [camera, debug, gl.domElement, props.engine, props.onDragPlaneChange, props.onDragResult, props.onHistoryChange, props.onHoverChange, props.onInteractionMetricsChange, props.onPlacementCancelled, props.onPlacementCommitted, props.onPlacementModeChange, props.onSelectionChange, props.onStateChange, props.cameraController, props.placementSession, renderer]);

  useEffect(() => {
    interactionRef.current?.setSelectedBrickId(props.selectedBrickId);
  }, [props.selectedBrickId]);

  useEffect(() => {
    interactionRef.current?.setPlacementMode(props.placementMode);
    placementRef.current?.setPlacementMode(props.placementMode);
  }, [props.placementMode]);

  useEffect(() => {
    interactionRef.current?.setPrecisionState(props.precision?.state);
  }, [props.precision?.state]);

  useEffect(() => {
    if (renderer === null) {
      return;
    }
    const preview = props.precision?.preview;
    if (preview === undefined) {
      renderer.endPrecisionPreview();
      return;
    }
    renderer.beginPrecisionPreview(preview.request.movingBrickId);
    if (preview.result.transform !== undefined) {
      renderer.updatePrecisionPreview(preview.result.transform, preview.result.valid);
    }
    return () => renderer.endPrecisionPreview();
  }, [props.precision?.preview, renderer]);

  useFrame((_state, delta) => {
    if (!frameCoordinator.current.consumeFrameRequest()) return;
    props.physics?.update(delta);
    interactionRef.current?.update(delta);
    if (interactionRef.current?.hasActiveCameraMovement() === true) frameCoordinator.current.requestFrame();
    renderer?.tickVisualFeedback(delta);
    if (props.benchmark === true || props.physics !== undefined || renderer?.hasActiveVisualFeedback === true) frameCoordinator.current.requestFrame();
    if (renderer === null) {
      return;
    }
    renderer.refreshVisibility(camera as unknown as Camera, props.placementSession === undefined && props.precision === undefined);
    frameAccumulator.current.elapsed += delta;
    frameAccumulator.current.frames += 1;
    if (frameAccumulator.current.elapsed >= 0.25) {
      const elapsed = frameAccumulator.current.elapsed;
      const frames = frameAccumulator.current.frames;
      props.onFrameMetrics({
        fps: frames / elapsed,
        frameMs: (elapsed / frames) * 1000,
        drawCalls: gl.info.render.calls,
        instanceCount: renderer.getInstanceCount(),
        visibleInstanceCount: renderer.getVisibleInstanceCount(),
        triangles: gl.info.render.triangles
      });
      frameAccumulator.current = { elapsed: 0, frames: 0 };
    }
  });

  return (
    <>
      <color attach="background" args={["#111619"]} />
      <ambientLight intensity={0.72} color="#d7dddd" />
      <hemisphereLight intensity={0.75} color="#dfe7e5" groundColor="#4f5859" />
      <directionalLight
        castShadow
        position={[4, 9, 5]}
        intensity={2.2}
        color="#fff4dc"
        shadow-bias={-0.0002}
        shadow-normalBias={0.025}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.1}
        shadow-camera-far={40}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <InfiniteGround />
      <group ref={groupRef} name="brick-renderer" />
      {props.precision !== undefined && <PrecisionOverlay engine={props.engine} {...props.precision} />}
      <OrbitControls
        ref={controlsRef as Ref<OrbitControlsLike>}
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxPolarAngle={Math.PI / 2.05}
        makeDefault
      />
    </>
  );
};

const InfiniteGround = (): ReactElement => {
  const { camera } = useThree();
  const groundRef = useRef<Group>(null);
  const nearGridRef = useRef<GridHelper>(null);
  const farGridRef = useRef<GridHelper>(null);

  useFrame(() => {
    const ground = groundRef.current;
    if (ground === null) return;
    const x = Math.round(camera.position.x / INFINITE_GROUND_FOLLOW_STEP) * INFINITE_GROUND_FOLLOW_STEP;
    const z = Math.round(camera.position.z / INFINITE_GROUND_FOLLOW_STEP) * INFINITE_GROUND_FOLLOW_STEP;
    if (ground.position.x !== x || ground.position.z !== z) ground.position.set(x, -0.64, z);
    const cameraDistance = camera.position.distanceTo(ground.position);
    const fade = MathUtils.clamp((cameraDistance - 12) / 160, 0, 1);
    const nearMaterial = nearGridRef.current?.material as LineBasicMaterial | undefined;
    const farMaterial = farGridRef.current?.material as LineBasicMaterial | undefined;
    if (nearMaterial !== undefined) nearMaterial.opacity = MathUtils.lerp(0.5, 0.18, fade);
    if (farMaterial !== undefined) farMaterial.opacity = MathUtils.lerp(0.2, 0.04, fade);
  });

  return (
    <group ref={groundRef} position={[0, -0.64, 0]} name="infinite-ground">
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow name="ground-surface">
        <planeGeometry args={[INFINITE_GROUND_SIZE, INFINITE_GROUND_SIZE]} />
        <meshStandardMaterial color="#7d8584" roughness={0.86} metalness={0.02} />
      </mesh>
      <gridHelper ref={farGridRef} args={[FAR_GRID_SIZE, FAR_GRID_DIVISIONS, "#566261", "#667171"]} position={[0, 0.004, 0]} name="ground-grid-far" material-transparent material-opacity={0.2} material-depthWrite={false} />
      <gridHelper ref={nearGridRef} args={[NEAR_GRID_SIZE, NEAR_GRID_DIVISIONS, "#687271", "#87918f"]} position={[0, 0.006, 0]} name="ground-grid-near" material-transparent material-opacity={0.5} material-depthWrite={false} />
    </group>
  );
};
