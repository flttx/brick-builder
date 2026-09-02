import * as THREE from "three";
import { GROUND_LEVEL } from "../../../../../src/math/transform.js";
import { groundPositionYForColliders } from "../../../../../src/index.js";
import type { BrickColorRegistry, BrickEngine, BrickInstance, DragResult, PartDefinition, Transform } from "../../../../../src/index.js";
import { PartAssetRegistry } from "../assets/part-asset-registry.js";
import { DragProxy } from "./drag-proxy.js";
import { PlacementProxy } from "./placement-proxy.js";
import { RenderBatch } from "./render-batch.js";
import { SelectionProxy } from "./selection-proxy.js";
import { toThreeQuaternion, toThreeVector } from "./three-adapter.js";

export interface BrickRenderer {
  addBrick(brick: BrickInstance): void;
  removeBrick(brickId: string): void;
  updateTransform(brickId: string, transform: Transform): void;
  updateColor(brickId: string, colorId: string): void;
  setSelected(brickId: string | undefined): void;
  setHovered(brickId: string | undefined): void;
  beginPlacement(partId: string, colorId: string, transform: Transform): void;
  updatePlacement(freeTransform: Transform, result: DragResult): void;
  endPlacement(): void;
  beginPrecisionPreview(brickId: string): void;
  updatePrecisionPreview(transform: Transform, valid: boolean): void;
  endPrecisionPreview(): void;
}

export interface ThreeBrickRendererOptions {
  shouldFailNextAssetLoad?: () => boolean;
  onAssetFailure?: (partId: string, reason: string) => void;
}

export class ThreeBrickRenderer implements BrickRenderer {
  public readonly batches = new Map<string, RenderBatch>();
  public readonly dragProxy: DragProxy;

  private readonly selectionProxy: SelectionProxy;
  private readonly hoverProxy: SelectionProxy;
  private readonly placementProxies = new Map<string, PlacementProxy>();
  private readonly assets: PartAssetRegistry;
  private readonly unsubscribeAssetLoaded: () => void;
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly brickBatch = new Map<string, RenderBatch>();
  private readonly brickPart = new Map<string, string>();
  private readonly brickColor = new Map<string, string>();
  private selectedBrickId: string | undefined;
  private hoveredBrickId: string | undefined;
  private draggingBrickId: string | undefined;
  private feedbackBrickId: string | undefined;
  private feedbackElapsed = 0;

  public constructor(public readonly parent: THREE.Object3D, private readonly engine: BrickEngine, capacity = 128, private readonly colors: BrickColorRegistry = engine.colors, options: ThreeBrickRendererOptions = {}) {
    this.assets = new PartAssetRegistry(engine.parts, { ...(options.shouldFailNextAssetLoad === undefined ? {} : { shouldFailNextLoad: options.shouldFailNextAssetLoad }), ...(options.onAssetFailure === undefined ? {} : { onFailure: options.onAssetFailure }) });
    this.unsubscribeAssetLoaded = this.assets.subscribe((event) => this.applyLoadedAsset(event.partId, event.geometry));
    const geometry = this.geometryForPart(engine.parts.get("brick-2x4"));
    this.selectionProxy = new SelectionProxy(parent, geometry, "#f6c453");
    this.hoverProxy = new SelectionProxy(parent, geometry, "#91a9ac");
    this.dragProxy = new DragProxy(parent, geometry);
    this.capacity = capacity;
  }

  private readonly capacity: number;

  public syncFromEngine(): void {
    const present = new Set<string>();
    for (const brick of this.engine.bricks.values()) {
      present.add(brick.id);
      this.addBrick(brick);
      if (brick.id !== this.draggingBrickId) {
        this.updateTransform(brick.id, brick.transform);
      }
    }
    for (const brickId of [...this.brickBatch.keys()]) {
      if (!present.has(brickId)) {
        this.removeBrick(brickId);
      }
    }
    this.refreshProxy(this.selectedBrickId, this.selectionProxy);
    this.refreshProxy(this.hoveredBrickId, this.hoverProxy);
  }

  public addBrick(brick: BrickInstance): void {
    let batch = this.brickBatch.get(brick.id);
    if (batch === undefined) {
      batch = this.batchForPart(brick.partId);
      batch.add(brick.id, brick.transform, colorForBrick(brick.colorId, this.colors));
      this.brickBatch.set(brick.id, batch);
    }
    this.brickPart.set(brick.id, brick.partId);
    this.brickColor.set(brick.id, brick.colorId);
  }

  public removeBrick(brickId: string): void {
    const batch = this.brickBatch.get(brickId);
    const partId = this.brickPart.get(brickId);
    batch?.remove(brickId);
    this.brickBatch.delete(brickId);
    this.brickPart.delete(brickId);
    this.brickColor.delete(brickId);
    if (partId !== undefined && batch?.brickToInstance.size === 0) {
      batch.dispose(false);
      this.batches.delete(partId);
      this.geometries.delete(partId);
      this.assets.release(partId);
    }
    if (this.selectedBrickId === brickId) {
      this.setSelected(undefined);
    }
    if (this.hoveredBrickId === brickId) {
      this.setHovered(undefined);
    }
  }

  public updateTransform(brickId: string, transform: Transform): void {
    this.brickBatch.get(brickId)?.updateMatrix(brickId, transform);
  }

  public updateColor(brickId: string, colorId: string): void {
    this.brickBatch.get(brickId)?.updateColor(brickId, colorForBrick(colorId, this.colors));
    this.brickColor.set(brickId, colorId);
  }

  public setSelected(brickId: string | undefined): void {
    this.selectedBrickId = brickId;
    this.refreshProxy(brickId, this.selectionProxy);
    if (brickId !== undefined && brickId === this.hoveredBrickId) {
      this.hoverProxy.setVisible(false);
    } else {
      this.refreshProxy(this.hoveredBrickId, this.hoverProxy);
    }
  }

  public setHovered(brickId: string | undefined): void {
    this.hoveredBrickId = brickId;
    if (brickId !== undefined && brickId === this.selectedBrickId) {
      this.hoverProxy.setVisible(false);
    } else {
      this.refreshProxy(brickId, this.hoverProxy);
    }
  }

  public beginDrag(brickId: string): void {
    this.feedbackBrickId = undefined;
    this.draggingBrickId = brickId;
    this.brickBatch.get(brickId)?.setHidden(brickId, true);
    const brick = this.engine.bricks.get(brickId);
    this.dragProxy.setGeometry(this.geometryForPart(this.engine.parts.get(brick.partId)));
    this.dragProxy.setColor(colorForBrick(brick.colorId, this.colors));
    this.dragProxy.setInvalid(false);
    this.dragProxy.setTransform(brick.transform);
    this.dragProxy.setVisible(true);
    this.selectionProxy.setVisible(false);
  }

  public updateDrag(freeTransform: Transform, result: DragResult): void {
    const draggingPartId = this.draggingBrickId === undefined ? undefined : this.engine.bricks.get(this.draggingBrickId).partId;
    let displayTransform = result.mode === "free"
      ? this.clampToGround(result.transform, draggingPartId)
      : freeTransform;
    if (result.candidate !== undefined && result.valid) {
      const strength = magnetStrength(result.candidate.distance, this.engine.snap.config.detectRadius, this.engine.snap.config.strongLockRadius);
      const freePosition = toThreeVector(freeTransform.position);
      freePosition.y = Math.max(this.groundY(draggingPartId, freeTransform.rotation), freePosition.y);
      const snapPosition = toThreeVector(result.candidate.transform.position);
      const displayPosition = freePosition.lerp(snapPosition, strength);
      const displayRotation = toThreeQuaternion(freeTransform.rotation).slerp(toThreeQuaternion(result.candidate.transform.rotation), strength);
      displayPosition.y = Math.max(this.groundY(draggingPartId, {
        x: displayRotation.x,
        y: displayRotation.y,
        z: displayRotation.z,
        w: displayRotation.w
      }), displayPosition.y);
      displayTransform = {
        position: { x: displayPosition.x, y: displayPosition.y, z: displayPosition.z },
        rotation: { x: displayRotation.x, y: displayRotation.y, z: displayRotation.z, w: displayRotation.w }
      };
    }
    this.dragProxy.setTransform(displayTransform);
    this.dragProxy.setInvalid(!result.valid);
  }

  public endDrag(committed = false): void {
    const finishedBrickId = this.draggingBrickId;
    this.feedbackBrickId = undefined;
    if (this.draggingBrickId !== undefined) {
      this.brickBatch.get(this.draggingBrickId)?.setHidden(this.draggingBrickId, false);
    }
    this.dragProxy.setVisible(false);
    this.draggingBrickId = undefined;
    this.syncFromEngine();
    if (committed && finishedBrickId !== undefined && this.engine.bricks.has(finishedBrickId)) {
      const brick = this.engine.bricks.get(finishedBrickId);
      this.feedbackBrickId = finishedBrickId;
      this.feedbackElapsed = 0;
      this.dragProxy.setColor(colorForBrick(brick.colorId, this.colors));
      this.dragProxy.setTransform({
        position: { ...brick.transform.position, y: brick.transform.position.y + 0.04 },
        rotation: { ...brick.transform.rotation }
      });
      this.dragProxy.setInvalid(false);
      this.dragProxy.setVisible(true);
    }
  }

  public tickVisualFeedback(delta: number): void {
    if (this.feedbackBrickId === undefined) {
      return;
    }
    this.feedbackElapsed += delta;
    const progress = this.feedbackElapsed / 0.14;
    if (progress >= 1 || !this.engine.bricks.has(this.feedbackBrickId)) {
      this.dragProxy.setVisible(false);
      this.feedbackBrickId = undefined;
      return;
    }
    const brick = this.engine.bricks.get(this.feedbackBrickId);
    const rebound = 0.04 * (1 - progress) * Math.cos(progress * Math.PI * 2);
    this.dragProxy.setTransform({
      position: { ...brick.transform.position, y: brick.transform.position.y + rebound },
      rotation: { ...brick.transform.rotation }
    });
  }

  public beginPlacement(partId: string, colorId: string, transform: Transform): void {
    const proxy = this.placementProxies.get(partId) ?? this.createPlacementProxy(partId);
    for (const [otherPartId, otherProxy] of this.placementProxies) {
      otherProxy.setVisible(otherPartId === partId);
    }
    proxy.setColor(colorForBrick(colorId, this.colors));
    proxy.setInvalid(false);
    proxy.setTransform(transform);
    proxy.setVisible(true);
  }

  public updatePlacement(freeTransform: Transform, result: DragResult): void {
    const proxy = [...this.placementProxies.values()].find((candidate) => candidate.mesh.visible);
    if (proxy === undefined) {
      return;
    }
    proxy.setTransform(this.displayTransform(freeTransform, result, proxy.partId));
    proxy.setInvalid(!result.valid);
  }

  public endPlacement(): void {
    for (const proxy of this.placementProxies.values()) {
      proxy.setVisible(false);
    }
  }

  public beginPrecisionPreview(brickId: string): void {
    this.feedbackBrickId = undefined;
    this.draggingBrickId = brickId;
    this.brickBatch.get(brickId)?.setHidden(brickId, true);
    const brick = this.engine.bricks.get(brickId);
    this.dragProxy.setGeometry(this.geometryForPart(this.engine.parts.get(brick.partId)));
    this.dragProxy.setColor(colorForBrick(brick.colorId, this.colors));
    this.dragProxy.setInvalid(false);
    this.dragProxy.setTransform(brick.transform);
    this.dragProxy.setVisible(true);
    this.selectionProxy.setVisible(false);
  }

  public updatePrecisionPreview(transform: Transform, valid: boolean): void {
    if (this.draggingBrickId === undefined) {
      return;
    }
    this.dragProxy.setTransform(transform);
    this.dragProxy.setInvalid(!valid);
  }

  public endPrecisionPreview(): void {
    if (this.draggingBrickId !== undefined) {
      this.brickBatch.get(this.draggingBrickId)?.setHidden(this.draggingBrickId, false);
    }
    this.dragProxy.setVisible(false);
    this.draggingBrickId = undefined;
    this.syncFromEngine();
  }

  public getPickableObjects(): THREE.Object3D[] {
    return [...this.batches.values()].flatMap((batch) => batch.meshes);
  }

  public getBrickIdFromIntersection(intersection: THREE.Intersection): string | undefined {
    if (intersection.instanceId === undefined || !(intersection.object instanceof THREE.InstancedMesh)) {
      return undefined;
    }
    for (const batch of this.batches.values()) {
      const brickId = batch.getBrickIdForMesh(intersection.object, intersection.instanceId);
      if (brickId !== undefined) return brickId;
    }
    return undefined;
  }

  public getInstanceCount(): number {
    return [...this.batches.values()].reduce((count, batch) => count + batch.brickToInstance.size, 0);
  }

  public getChunkCount(): number {
    return [...this.batches.values()].reduce((count, batch) => count + batch.chunkCount, 0);
  }

  public get hasActiveVisualFeedback(): boolean { return this.feedbackBrickId !== undefined; }

  public dispose(): void {
    this.unsubscribeAssetLoaded();
    this.selectionProxy.dispose();
    this.hoverProxy.dispose();
    this.dragProxy.dispose();
    for (const proxy of this.placementProxies.values()) {
      proxy.dispose();
    }
    for (const batch of this.batches.values()) {
      batch.dispose(false);
    }
    this.assets.dispose();
    this.geometries.clear();
    this.brickPart.clear();
  }

  private batchForPart(partId: string): RenderBatch {
    const existing = this.batches.get(partId);
    if (existing !== undefined) {
      return existing;
    }
    const part = this.engine.parts.get(partId);
    this.assets.retain(partId);
    const batch = new RenderBatch({ parent: this.parent, geometry: this.geometryForPart(part), capacity: this.capacity });
    this.batches.set(partId, batch);
    return batch;
  }

  private geometryForPart(part: PartDefinition): THREE.BufferGeometry {
    const existing = this.geometries.get(part.id);
    if (existing !== undefined) {
      return existing;
    }
    const geometry = this.assets.getPart(part.id).geometry;
    void this.assets.preloadPart(part.id);
    this.geometries.set(part.id, geometry);
    return geometry;
  }

  private applyLoadedAsset(partId: string, geometry: THREE.BufferGeometry): void {
    const previous = this.geometries.get(partId);
    this.geometries.set(partId, geometry);
    this.batches.get(partId)?.replaceGeometry(geometry);
    for (const proxy of this.placementProxies.values()) {
      if (proxy.partId === partId) proxy.setGeometry(geometry);
    }
    const selectedPartId = this.selectedBrickId === undefined ? undefined : this.brickPart.get(this.selectedBrickId);
    if (selectedPartId === partId) this.selectionProxy.setGeometry(geometry);
    const hoveredPartId = this.hoveredBrickId === undefined ? undefined : this.brickPart.get(this.hoveredBrickId);
    if (hoveredPartId === partId) this.hoverProxy.setGeometry(geometry);
    const draggingPartId = this.draggingBrickId === undefined ? undefined : this.brickPart.get(this.draggingBrickId);
    if (draggingPartId === partId) this.dragProxy.setGeometry(geometry);
    if (previous !== undefined && previous !== geometry) previous.dispose();
  }

  private createPlacementProxy(partId: string): PlacementProxy {
    const proxy = new PlacementProxy(partId, this.parent, this.geometryForPart(this.engine.parts.get(partId)));
    this.placementProxies.set(partId, proxy);
    return proxy;
  }

  private displayTransform(freeTransform: Transform, result: DragResult, partId?: string): Transform {
    if (result.candidate === undefined || !result.valid) {
      return this.clampToGround(freeTransform, partId);
    }
    const strength = magnetStrength(result.candidate.distance, this.engine.snap.config.detectRadius, this.engine.snap.config.strongLockRadius);
    const freePosition = toThreeVector(freeTransform.position);
    freePosition.y = Math.max(this.groundY(partId, freeTransform.rotation), freePosition.y);
    const snapPosition = toThreeVector(result.candidate.transform.position);
    const displayPosition = freePosition.lerp(snapPosition, strength);
    const displayRotation = toThreeQuaternion(freeTransform.rotation).slerp(toThreeQuaternion(result.candidate.transform.rotation), strength);
    displayPosition.y = Math.max(this.groundY(partId, {
      x: displayRotation.x,
      y: displayRotation.y,
      z: displayRotation.z,
      w: displayRotation.w
    }), displayPosition.y);
    return {
      position: { x: displayPosition.x, y: displayPosition.y, z: displayPosition.z },
      rotation: { x: displayRotation.x, y: displayRotation.y, z: displayRotation.z, w: displayRotation.w }
    };
  }

  private clampToGround(transform: Transform, partId?: string): Transform {
    return {
      ...transform,
      position: { ...transform.position, y: Math.max(this.groundY(partId, transform.rotation), transform.position.y) }
    };
  }

  private groundY(partId: string | undefined, rotation: Transform["rotation"]): number {
    if (partId === undefined) return GROUND_LEVEL;
    return groundPositionYForColliders(this.engine.parts.get(partId).colliders, rotation);
  }

  private refreshProxy(brickId: string | undefined, proxy: SelectionProxy): void {
    if (brickId === undefined || brickId === this.draggingBrickId || !this.engine.bricks.has(brickId)) {
      proxy.setVisible(false);
      return;
    }
    const brick = this.engine.bricks.get(brickId);
    proxy.setGeometry(this.geometryForPart(this.engine.parts.get(brick.partId)));
    proxy.setTransform(brick.transform);
    proxy.setVisible(true);
  }
}

const colorForBrick = (colorId: string, colors: BrickColorRegistry): THREE.ColorRepresentation => {
  return colors.tryGet(colorId)?.baseColor ?? "#a8b2b1";
};

const magnetStrength = (distance: number, detectRadius: number, strongLockRadius: number): number => {
  if (distance <= strongLockRadius) {
    return 1;
  }
  return Math.min(0.72, Math.max(0.18, (detectRadius - distance) / Math.max(0.001, detectRadius - strongLockRadius)));
};
