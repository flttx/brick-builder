import * as THREE from "three";
import { BrickEngine, GROUND_LEVEL } from "../../../../../src/index.js";
import type { BrickInstance, DragResult, Transform, SnapCandidate } from "../../../../../src/index.js";
import { identity } from "../../../../../src/math/quat.js";
import type { BrickCameraController } from "../camera/camera-controller.js";
import type { ThreeBrickRenderer } from "../renderer/brick-renderer.js";
import { fromThreeVector } from "../renderer/three-adapter.js";
import { BrickPicker } from "../interaction/picker.js";
import { findSnapAssist } from "../interaction/snap-assist.js";
import type { NewBrickPlacementSession } from "./placement-session.js";
import type { PlacementMode } from "../../../../../src/drag/placement-mode.js";

export interface PlacementCommit {
  brick: BrickInstance;
  candidate?: SnapCandidate;
}

export interface PlacementControllerOptions {
  engine: BrickEngine;
  renderer: ThreeBrickRenderer;
  camera: THREE.PerspectiveCamera;
  cameraController: BrickCameraController;
  element: HTMLCanvasElement;
  session: NewBrickPlacementSession;
  placementMode?: PlacementMode;
  onPlacementModeChange?: (mode: PlacementMode) => void;
  onStateChange: (state: "preview" | "placing") => void;
  onDragResult: (freeTransform: Transform, result: DragResult) => void;
  onDragPlaneChange: (plane: THREE.Plane | undefined) => void;
  onMetricsChange: (metrics: { snapTime: number; collisionTime: number }) => void;
  onCommit: (commit: PlacementCommit) => void;
  onCancel: () => void;
}

interface PlacementPointer {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  pointerType?: string;
}

export class PlacementController {
  private readonly previewEngine: BrickEngine;
  private readonly picker: BrickPicker;
  private readonly previewId: string;
  private readonly dragPlane = new THREE.Plane();
  private readonly pointerOffset = new THREE.Vector3();
  private pointer: PlacementPointer | undefined;
  private state: "preview" | "placing" = "preview";
  private placementMode: PlacementMode;
  private temporaryFree = false;

  public constructor(private readonly options: PlacementControllerOptions) {
    this.previewId = `placement-preview-${options.session.id}`;
    this.placementMode = options.placementMode ?? "auto";
    this.previewEngine = new BrickEngine({ parts: options.engine.parts, colors: options.engine.colors });
    this.previewEngine.loadSnapshot(options.engine.getSnapshot());
    this.previewEngine.createBrick({
      id: this.previewId,
      partId: options.session.partId,
      colorId: options.session.colorId,
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: identity() }
    });
    this.picker = new BrickPicker(options.renderer, options.element);
    this.previewEngine.beginDrag(this.previewId, this.effectivePlacementMode());
    options.renderer.beginPlacement(options.session.partId, options.session.colorId, this.previewEngine.bricks.get(this.previewId).transform);
    options.element.addEventListener("pointerdown", this.handlePointerDown, { capture: true });
    options.element.addEventListener("pointermove", this.handlePointerMove, { capture: true });
    options.element.addEventListener("pointerup", this.handlePointerUp, { capture: true });
    options.element.addEventListener("pointercancel", this.handlePointerCancel, { capture: true });
  }

  public attachKeyboard(target: Document = document): () => void {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" || event.key.toLowerCase() === "x") {
        event.preventDefault();
        this.cancel();
      }
      if (event.key === "Alt" && this.placementMode === "auto" && !event.repeat && this.state === "placing") {
        this.temporaryFree = true;
        this.previewEngine.setDragPlacementMode("free");
        this.options.onPlacementModeChange?.("free");
        this.update(this.pointer?.lastX ?? 0, this.pointer?.lastY ?? 0);
      }
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.key !== "Alt" || !this.temporaryFree || this.placementMode !== "auto" || this.state !== "placing") {
        return;
      }
      this.temporaryFree = false;
      this.previewEngine.setDragPlacementMode("auto");
      this.options.onPlacementModeChange?.("auto");
      this.update(this.pointer?.lastX ?? 0, this.pointer?.lastY ?? 0);
    };
    target.addEventListener("keydown", handleKeyDown);
    target.addEventListener("keyup", handleKeyUp);
    return () => {
      target.removeEventListener("keydown", handleKeyDown);
      target.removeEventListener("keyup", handleKeyUp);
    };
  }

  public setPlacementMode(mode: PlacementMode): void {
    this.placementMode = mode;
    this.temporaryFree = false;
    this.previewEngine.setDragPlacementMode(this.effectivePlacementMode());
    this.options.onPlacementModeChange?.(mode);
    if (this.pointer !== undefined) {
      this.update(this.pointer.lastX, this.pointer.lastY);
    }
  }

  public cancel(): void {
    if (this.state === "preview" && this.pointer === undefined) {
      this.options.renderer.endPlacement();
      this.options.onDragPlaneChange(undefined);
      this.options.onCancel();
      return;
    }
    this.finish(false);
  }

  public dispose(): void {
    const element = this.options.element;
    element.removeEventListener("pointerdown", this.handlePointerDown, { capture: true });
    element.removeEventListener("pointermove", this.handlePointerMove, { capture: true });
    element.removeEventListener("pointerup", this.handlePointerUp, { capture: true });
    element.removeEventListener("pointercancel", this.handlePointerCancel, { capture: true });
    if (this.pointer !== undefined) {
      this.releasePointer(this.pointer.id);
    }
    this.options.renderer.endPlacement();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.pointer !== undefined) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, pointerType: event.pointerType };
    this.dragPlane.setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, GROUND_LEVEL, 0)
    );
    this.options.cameraController.setEnabled(false);
    try {
      this.options.element.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail after a browser-level cancel.
    }
    this.state = "placing";
    this.options.onStateChange(this.state);
    this.options.onDragPlaneChange(this.dragPlane);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.pointer?.id !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.pointer.lastX = event.clientX;
    this.pointer.lastY = event.clientY;
    this.update(event.clientX, event.clientY);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.pointer?.id !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.update(event.clientX, event.clientY);
    this.finish(true);
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.pointer?.id !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.finish(false);
  };

  private update(clientX: number, clientY: number): void {
    const pointer = this.pointer;
    if (pointer === undefined) {
      return;
    }
    const hit = this.intersectDragPlane(clientX, clientY);
    if (hit === undefined) {
      return;
    }
    const position = hit.sub(this.pointerOffset);
    position.y = GROUND_LEVEL;
    const freeTransform: Transform = {
      position: {
        x: snapGround(position.x),
        y: GROUND_LEVEL,
        z: snapGround(position.z)
      },
      rotation: identity()
    };
    const snapAssist = this.getSnapAssist(clientX, clientY, freeTransform);
    const dragTransform = snapAssist?.transform ?? freeTransform;
    const pointerWorld = snapAssist?.pointerWorld ?? fromThreeVector(position);
    const started = performance.now();
    const result = this.previewEngine.updateDrag(dragTransform, pointerWorld, this.effectivePlacementMode());
    const elapsed = performance.now() - started;
    this.options.onMetricsChange({ snapTime: elapsed, collisionTime: elapsed });
    this.options.renderer.updatePlacement(freeTransform, result);
    this.options.onDragResult(freeTransform, result);
  }

  private intersectDragPlane(clientX: number, clientY: number): THREE.Vector3 | undefined {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(this.getPointerNdc(clientX, clientY), this.options.camera);
    return raycaster.ray.intersectPlane(this.dragPlane, new THREE.Vector3()) ?? undefined;
  }

  private getPointerNdc(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.options.element.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  private getSnapAssist(clientX: number, clientY: number, freeTransform: Transform): { transform: Transform; pointerWorld: { x: number; y: number; z: number } } | undefined {
    if (this.effectivePlacementMode() !== "auto") {
      return undefined;
    }
    const target = this.picker.pick(clientX, clientY, this.options.camera);
    if (target === undefined) {
      return undefined;
    }
    return findSnapAssist(this.previewEngine, this.previewId, target.brickId, fromThreeVector(target.point), freeTransform);
  }

  private finish(commit: boolean): void {
    const pointer = this.pointer;
    if (pointer !== undefined) {
      this.releasePointer(pointer.id);
    }
    this.pointer = undefined;
    this.options.cameraController.setEnabled(true);
    this.options.onDragPlaneChange(undefined);
    if (!commit) {
      this.options.renderer.endPlacement();
      this.options.onCancel();
      return;
    }
    const session = this.previewEngine.getDragSession();
    const brick: BrickInstance = {
      id: this.options.engine.allocateBrickId(),
      partId: this.options.session.partId,
      colorId: this.options.session.colorId,
      transform: session.currentTransform
    };
    const collision = this.options.engine.collision.checkBrick(brick, brick.transform);
    if (!collision.valid) {
      this.options.renderer.endPlacement();
      this.options.onCancel();
      return;
    }
    this.options.renderer.endPlacement();
    this.options.onCommit({
      brick,
      ...(session.snapCandidate === undefined ? {} : { candidate: session.snapCandidate })
    });
  }

  private releasePointer(pointerId: number): void {
    try {
      this.options.element.releasePointerCapture(pointerId);
    } catch {
      // The browser may have already released it.
    }
  }

  private effectivePlacementMode(): PlacementMode {
    return this.temporaryFree && this.placementMode === "auto" ? "free" : this.placementMode;
  }
}

const snapGround = (value: number): number => Math.round(value * 2) / 2;
