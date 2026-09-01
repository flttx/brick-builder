import * as THREE from "three";
import type { BrickEngine, DragResult, Transform, Vec3 } from "../../../../../src/index.js";
import type { BrickCameraController } from "../camera/camera-controller.js";
import type { ThreeBrickRenderer } from "../renderer/brick-renderer.js";
import { fromThreeVector } from "../renderer/three-adapter.js";
import { BrickPicker } from "./picker.js";
import { GROUND_LEVEL } from "../../../../../src/math/transform.js";
import type { PlacementMode } from "../../../../../src/drag/placement-mode.js";

export type PrecisionInteractionState = "precision_pick_source_a1" | "precision_pick_source_a2" | "precision_pick_target_b1" | "precision_pick_target_b2" | "precision_preview";
export type InteractionState = "idle" | "pressed" | "dragging_brick" | "orbiting_camera" | PrecisionInteractionState;

const CAMERA_MOVE_STEP = 0.45;

export interface InteractionMetrics {
  snapTime: number;
  collisionTime: number;
}

export interface PointerInput {
  pointerId: number;
  clientX: number;
  clientY: number;
  button: number;
  pointerType?: string;
  preventDefault?: () => void;
  stopImmediatePropagation?: () => void;
}

export interface InteractionControllerOptions {
  engine: BrickEngine;
  renderer: ThreeBrickRenderer;
  camera: THREE.PerspectiveCamera;
  cameraController: BrickCameraController;
  element: HTMLCanvasElement;
  dragThresholdPx?: number;
  onSelectionChange: (brickId: string | undefined) => void;
  onHoverChange: (brickId: string | undefined) => void;
  onStateChange: (state: InteractionState) => void;
  onDragResult: (freeTransform: Transform, result: DragResult) => void;
  onDragPlaneChange: (plane: THREE.Plane | undefined) => void;
  onMetricsChange: (metrics: InteractionMetrics) => void;
  onHistoryChange: () => void;
  placementMode?: PlacementMode;
  onPlacementModeChange?: (mode: PlacementMode) => void;
}

interface PointerRecord {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  pickedBrickId?: string;
  grabPoint?: THREE.Vector3;
  pointerType: string | undefined;
  thresholdPx: number;
}

export class InteractionController {
  private readonly picker: BrickPicker;
  private readonly dragThresholdPx: number;
  private pointer: PointerRecord | undefined;
  private state: InteractionState = "idle";
  private selectedBrickId: string | undefined;
  private latestPointer: { x: number; y: number; pointerType?: string } | undefined;
  private dragPlane: THREE.Plane | undefined;
  private grabOffset = new THREE.Vector3();
  private dragRotation: Transform["rotation"] | undefined;
  private hoveredBrickId: string | undefined;
  private readonly activePointers = new Map<number, string | undefined>();
  private enabled = true;
  private placementMode: PlacementMode;
  private temporaryFree = false;

  public constructor(private readonly options: InteractionControllerOptions) {
    this.picker = new BrickPicker(options.renderer, options.element);
    this.dragThresholdPx = options.dragThresholdPx ?? 6;
    this.placementMode = options.placementMode ?? "auto";
    options.element.addEventListener("pointerdown", this.handlePointerDown, { capture: true });
    options.element.addEventListener("pointermove", this.handlePointerMove, { capture: true });
    options.element.addEventListener("pointerup", this.handlePointerUp, { capture: true });
    options.element.addEventListener("pointercancel", this.handlePointerCancel, { capture: true });
  }

  public setSelectedBrickId(brickId: string | undefined): void {
    this.selectedBrickId = brickId;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.state === "dragging_brick") {
      this.cancelDrag();
    }
  }

  public setPlacementMode(mode: PlacementMode): void {
    if (mode === this.placementMode) {
      return;
    }
    if (mode === "precision" && this.state === "dragging_brick") {
      this.cancelDrag();
    }
    this.placementMode = mode;
    this.temporaryFree = false;
    this.options.onPlacementModeChange?.(mode);
    if (this.state === "dragging_brick") {
      this.options.engine.setDragPlacementMode(mode);
      this.refreshDragFromPointer();
    }
  }

  public setPrecisionState(state: PrecisionInteractionState | undefined): void {
    if (state === undefined) {
      if (isPrecisionState(this.state)) {
        this.transition("idle");
      }
      return;
    }
    if (this.state === "dragging_brick") {
      this.cancelDrag();
    }
    this.transition(state);
  }

  public getState(): InteractionState {
    return this.state;
  }

  public update(_delta: number): void {
    if (!this.enabled || this.state !== "idle" || this.latestPointer === undefined || this.latestPointer.pointerType === "touch") {
      return;
    }
    const picked = this.picker.pick(this.latestPointer.x, this.latestPointer.y, this.options.camera);
    const brickId = picked?.brickId;
    if (brickId !== this.hoveredBrickId) {
      this.hoveredBrickId = brickId;
      this.options.onHoverChange(brickId);
    }
  }

  public pointerDown(input: PointerInput): void {
    this.processPointerDown(input);
  }

  public pointerMove(input: PointerInput): void {
    this.processPointerMove(input);
  }

  public pointerUp(input: PointerInput): void {
    this.processPointerUp(input);
  }

  public pointerCancel(input: PointerInput): void {
    this.processPointerCancel(input);
  }

  public attachKeyboard(target: Document = document): () => void {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!this.enabled) {
        return;
      }
      if (event.key === "Alt" && this.state === "dragging_brick" && this.placementMode === "auto" && !event.repeat) {
        this.temporaryFree = true;
        this.options.engine.setDragPlacementMode("free");
        this.options.onPlacementModeChange?.("free");
        this.refreshDragFromPointer();
        return;
      }
      const cameraMove = cameraMoveForKey(event.key);
      if (cameraMove !== undefined && this.state === "idle" && !isTextInputTarget(event.target)) {
        event.preventDefault();
        this.options.cameraController.move?.(cameraMove.forward * CAMERA_MOVE_STEP, cameraMove.right * CAMERA_MOVE_STEP);
        return;
      }
      const commandKey = event.metaKey || event.ctrlKey;
      if (commandKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          this.options.engine.redo();
        } else {
          this.options.engine.undo();
        }
        this.options.renderer.syncFromEngine();
        this.options.onHistoryChange();
        return;
      }
      if (event.key.toLowerCase() === "r" && this.selectedBrickId !== undefined && this.state === "idle") {
        event.preventDefault();
        this.options.engine.rotateBrick(this.selectedBrickId, 1, event.shiftKey ? "x" : "y");
        this.options.renderer.syncFromEngine();
        this.options.onHistoryChange();
      }
      if ((event.key === "Delete" || event.key === "Backspace") && this.selectedBrickId !== undefined && this.state === "idle") {
        event.preventDefault();
        try {
          this.options.engine.deleteBrick(this.selectedBrickId);
          this.selectedBrickId = undefined;
          this.options.onSelectionChange(undefined);
          this.options.renderer.syncFromEngine();
          this.options.onHistoryChange();
        } catch {
          // Locked or otherwise invalid deletions are rejected by the engine.
        }
      }
      if (event.key === "Escape" && (this.state === "dragging_brick" || this.state === "pressed")) {
        event.preventDefault();
        if (this.state === "dragging_brick") {
          this.cancelDrag();
        } else {
          this.pointer = undefined;
          this.options.cameraController.setEnabled(true);
          this.transition("idle");
        }
      } else if (event.key === "Escape" && this.state === "idle" && this.selectedBrickId !== undefined) {
        event.preventDefault();
        this.selectedBrickId = undefined;
        this.options.onSelectionChange(undefined);
      }
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.key !== "Alt" || !this.temporaryFree || this.placementMode !== "auto" || this.state !== "dragging_brick") {
        return;
      }
      this.temporaryFree = false;
      this.options.engine.setDragPlacementMode("auto");
      this.options.onPlacementModeChange?.("auto");
      this.refreshDragFromPointer();
    };
    target.addEventListener("keydown", handleKeyDown);
    target.addEventListener("keyup", handleKeyUp);
    return () => {
      target.removeEventListener("keydown", handleKeyDown);
      target.removeEventListener("keyup", handleKeyUp);
    };
  }

  public dispose(): void {
    const element = this.options.element;
    element.removeEventListener("pointerdown", this.handlePointerDown, { capture: true });
    element.removeEventListener("pointermove", this.handlePointerMove, { capture: true });
    element.removeEventListener("pointerup", this.handlePointerUp, { capture: true });
    element.removeEventListener("pointercancel", this.handlePointerCancel, { capture: true });
    if (this.state === "dragging_brick") {
      this.cancelDrag();
    }
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.processPointerDown({
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button,
      pointerType: event.pointerType,
      preventDefault: () => event.preventDefault(),
      stopImmediatePropagation: () => event.stopImmediatePropagation()
    }, event.currentTarget);
  };

  private processPointerDown(input: PointerInput, captureTarget?: EventTarget | null): void {
    if (isPrecisionState(this.state)) {
      return;
    }
    if (input.pointerType === "touch") {
      const hadActivePointer = this.activePointers.size > 0;
      this.activePointers.set(input.pointerId, input.pointerType);
      if (this.state === "dragging_brick") {
        this.cancelDrag();
      } else if (this.state === "pressed") {
        this.releasePointer(this.pointer?.id ?? input.pointerId);
        this.pointer = undefined;
        this.options.cameraController.setEnabled(true);
        this.transition("idle");
      }
      if (hadActivePointer || this.state !== "idle") {
        this.options.cameraController.setEnabled(true);
        this.transition("orbiting_camera");
        return;
      }
    }
    if (!this.enabled || input.button !== 0 || this.state !== "idle") {
      return;
    }
    this.latestPointer = { x: input.clientX, y: input.clientY, ...(input.pointerType === undefined ? {} : { pointerType: input.pointerType }) };
    const picked = this.picker.pick(input.clientX, input.clientY, this.options.camera);
    if (picked === undefined) {
      this.selectedBrickId = undefined;
      this.options.onSelectionChange(undefined);
      this.transition("orbiting_camera");
      return;
    }
    input.preventDefault?.();
    input.stopImmediatePropagation?.();
    this.pointer = {
      id: input.pointerId,
      startX: input.clientX,
      startY: input.clientY,
      lastX: input.clientX,
      lastY: input.clientY,
      pickedBrickId: picked.brickId,
      grabPoint: picked.point,
      ...(input.pointerType === undefined ? { pointerType: undefined } : { pointerType: input.pointerType }),
      thresholdPx: input.pointerType === "touch" ? 12 : this.dragThresholdPx
    };
    this.options.cameraController.setEnabled(false);
    try {
      if (typeof HTMLElement !== "undefined" && captureTarget instanceof HTMLElement) {
        captureTarget.setPointerCapture(input.pointerId);
      }
    } catch {
      // Pointer capture can fail when a browser releases the pointer between events.
    }
    this.transition("pressed");
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.processPointerMove({
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button,
      pointerType: event.pointerType,
      preventDefault: () => event.preventDefault(),
      stopImmediatePropagation: () => event.stopImmediatePropagation()
    });
  };

  private processPointerMove(input: PointerInput): void {
    if (input.pointerType !== "touch") {
      this.latestPointer = { x: input.clientX, y: input.clientY, ...(input.pointerType === undefined ? {} : { pointerType: input.pointerType }) };
    }
    if (this.state === "orbiting_camera") {
      return;
    }
    const pointer = this.pointer;
    if (pointer === undefined || pointer.id !== input.pointerId) {
      return;
    }
    pointer.lastX = input.clientX;
    pointer.lastY = input.clientY;
    const distance = Math.hypot(input.clientX - pointer.startX, input.clientY - pointer.startY);
    if (this.state === "pressed" && distance > pointer.thresholdPx) {
      this.startDrag(pointer);
    }
    if (this.state !== "dragging_brick") {
      return;
    }
    input.preventDefault?.();
    input.stopImmediatePropagation?.();
    this.updateDrag(input.clientX, input.clientY);
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.processPointerUp({
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button,
      pointerType: event.pointerType,
      preventDefault: () => event.preventDefault(),
      stopImmediatePropagation: () => event.stopImmediatePropagation()
    });
  };

  private processPointerUp(input: PointerInput): void {
    if (input.pointerType === "touch") {
      this.activePointers.delete(input.pointerId);
    }
    if (this.state === "orbiting_camera") {
      if (this.activePointers.size === 0) {
        this.options.cameraController.setEnabled(true);
        this.transition("idle");
      }
      return;
    }
    const pointer = this.pointer;
    if (pointer === undefined || pointer.id !== input.pointerId) {
      return;
    }
    input.preventDefault?.();
    input.stopImmediatePropagation?.();
    if (this.state === "pressed") {
      this.selectedBrickId = pointer.pickedBrickId;
      this.options.onSelectionChange(pointer.pickedBrickId);
      this.releasePointer(input.pointerId);
      this.options.cameraController.setEnabled(true);
      this.pointer = undefined;
      this.transition("idle");
      return;
    }
    if (this.state === "dragging_brick") {
      pointer.lastX = input.clientX;
      pointer.lastY = input.clientY;
      this.updateDrag(input.clientX, input.clientY);
      this.finishDrag();
    }
    this.releasePointer(input.pointerId);
    this.pointer = undefined;
    this.options.cameraController.setEnabled(true);
    this.transition("idle");
  }

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    this.processPointerCancel({
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button,
      pointerType: event.pointerType,
      preventDefault: () => event.preventDefault(),
      stopImmediatePropagation: () => event.stopImmediatePropagation()
    });
  };

  private processPointerCancel(input: PointerInput): void {
    if (input.pointerType === "touch") {
      this.activePointers.delete(input.pointerId);
    }
    if (this.state === "dragging_brick") {
      this.cancelDrag();
    }
    if (this.pointer?.id === input.pointerId) {
      this.releasePointer(input.pointerId);
      this.pointer = undefined;
    }
    if (this.activePointers.size === 0) {
      this.options.cameraController.setEnabled(true);
      this.transition("idle");
    }
  }

  private startDrag(pointer: PointerRecord): void {
    const brickId = pointer.pickedBrickId;
    if (brickId === undefined || pointer.grabPoint === undefined) {
      return;
    }
    const brick = this.options.engine.bricks.get(brickId);
    this.options.engine.beginDrag(brickId, this.effectivePlacementMode());
    this.options.renderer.beginDrag(brickId);
    this.dragRotation = { ...brick.transform.rotation };
    this.dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, GROUND_LEVEL, 0)
    );
    const groundPoint = this.intersectDragPlane(pointer.startX, pointer.startY) ?? new THREE.Vector3(brick.transform.position.x, GROUND_LEVEL, brick.transform.position.z);
    this.grabOffset.copy(groundPoint).sub(new THREE.Vector3(brick.transform.position.x, GROUND_LEVEL, brick.transform.position.z));
    this.options.onDragPlaneChange(this.dragPlane);
    this.transition("dragging_brick");
  }

  private updateDrag(clientX: number, clientY: number): void {
    if (this.dragPlane === undefined || this.dragRotation === undefined || this.pointer === undefined) {
      return;
    }
    const hit = this.intersectDragPlane(clientX, clientY);
    if (hit === undefined) {
      return;
    }
    const position = hit.sub(this.grabOffset);
    position.y = GROUND_LEVEL;
    const freeTransform: Transform = {
      position: fromThreeVector(position),
      rotation: { ...this.dragRotation }
    };
    const snapAssist = this.getSnapAssist(clientX, clientY, freeTransform);
    const dragTransform = snapAssist?.transform ?? freeTransform;
    const pointerWorld = snapAssist?.pointerWorld ?? fromThreeVector(position);
    const started = performance.now();
    const result = this.options.engine.updateDrag(dragTransform, pointerWorld, this.effectivePlacementMode());
    const elapsed = performance.now() - started;
    this.options.onMetricsChange({ snapTime: elapsed, collisionTime: elapsed });
    this.options.renderer.updateDrag(freeTransform, result);
    this.options.onDragResult(freeTransform, result);
  }

  private intersectDragPlane(clientX: number, clientY: number): THREE.Vector3 | undefined {
    if (this.dragPlane === undefined) {
      return undefined;
    }
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(this.picker.getPointerNdc(clientX, clientY), this.options.camera);
    return raycaster.ray.intersectPlane(this.dragPlane, new THREE.Vector3()) ?? undefined;
  }

  private getSnapAssist(clientX: number, clientY: number, freeTransform: Transform): { transform: Transform; pointerWorld: Vec3 } | undefined {
    if (this.effectivePlacementMode() !== "auto" || this.pointer?.pickedBrickId === undefined) {
      return undefined;
    }
    const target = this.picker.pick(clientX, clientY, this.options.camera, this.pointer.pickedBrickId);
    if (target === undefined) {
      return undefined;
    }
    const movingBrick = this.options.engine.bricks.get(this.pointer.pickedBrickId);
    const targetBrick = this.options.engine.bricks.get(target.brickId);
    const movingPart = this.options.engine.parts.get(movingBrick.partId);
    const targetPart = this.options.engine.parts.get(targetBrick.partId);
    return {
      transform: {
        position: {
          x: target.point.x,
          y: targetBrick.transform.position.y + (targetPart.dimensions.height + movingPart.dimensions.height) / 2,
          z: target.point.z
        },
        rotation: { ...freeTransform.rotation }
      },
      pointerWorld: fromThreeVector(target.point)
    };
  }

  private finishDrag(): void {
    const session = this.options.engine.getDragSession();
    let committed = false;
    try {
      const canCommitSnap = session.placementMode === "auto" && session.snapCandidate !== undefined && session.mode === "snap";
      const canCommitGround = session.mode === "free" && Math.abs(session.currentTransform.position.y - GROUND_LEVEL) <= 1e-4;
      if (canCommitSnap || canCommitGround) {
        this.options.engine.commitDrag();
        committed = true;
      } else {
        this.options.engine.cancelDrag();
      }
    } catch {
      try {
        this.options.engine.cancelDrag();
      } catch {
        // The engine already restored an invalid placement.
      }
    }
    this.options.renderer.endDrag(committed);
    this.options.onDragPlaneChange(undefined);
    this.options.onHistoryChange();
    this.dragPlane = undefined;
    this.dragRotation = undefined;
  }

  private cancelDrag(): void {
    try {
      this.options.engine.cancelDrag();
    } catch {
      // A cancellation after an invalid commit is already restored by the engine.
    }
    this.options.renderer.endDrag();
    this.options.onDragPlaneChange(undefined);
    this.options.onHistoryChange();
    this.dragPlane = undefined;
    this.dragRotation = undefined;
    this.transition("idle");
  }

  private effectivePlacementMode(): PlacementMode {
    return this.temporaryFree && this.placementMode === "auto" ? "free" : this.placementMode;
  }

  private refreshDragFromPointer(): void {
    if (this.pointer !== undefined) {
      this.updateDrag(this.pointer.lastX, this.pointer.lastY);
    }
  }

  private releasePointer(pointerId: number): void {
    try {
      this.options.element.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  }

  private transition(next: InteractionState): void {
    if (this.state === next) {
      return;
    }
    this.state = next;
    this.options.onStateChange(next);
  }
}

const isPrecisionState = (state: InteractionState): state is PrecisionInteractionState => state.startsWith("precision_");

const cameraMoveForKey = (key: string): { forward: number; right: number } | undefined => {
  switch (key.toLowerCase()) {
    case "w": return { forward: 1, right: 0 };
    case "s": return { forward: -1, right: 0 };
    case "a": return { forward: 0, right: -1 };
    case "d": return { forward: 0, right: 1 };
    default: return undefined;
  }
};

const isTextInputTarget = (target: EventTarget | null): boolean => {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
};

export const vec3FromPointer = (value: THREE.Vector3): Vec3 => fromThreeVector(value);
