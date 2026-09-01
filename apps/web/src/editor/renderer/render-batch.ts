import * as THREE from "three";
import type { Transform } from "../../../../../src/index.js";
import { createBrickMaterial } from "./brick-material.js";
import { toThreeMatrix } from "./three-adapter.js";

export interface RenderBatchOptions {
  parent: THREE.Object3D;
  geometry: THREE.BufferGeometry;
  capacity?: number;
  material?: THREE.MeshPhysicalMaterial;
}

export class RenderBatch {
  public readonly mesh: THREE.InstancedMesh;
  public readonly meshes: THREE.InstancedMesh[] = [];
  public readonly brickToInstance = new Map<string, number>();
  public readonly instanceToBrick = new Map<number, string>();
  public readonly freeSlots: number[] = [];

  private readonly transforms = new Map<string, THREE.Matrix4>();
  private readonly hidden = new Set<string>();
  private readonly capacity: number;
  private readonly chunks: Array<{ index: number; mesh: THREE.InstancedMesh; freeSlots: number[]; active: number }> = [];
  private readonly meshToChunk = new Map<THREE.InstancedMesh, { index: number; mesh: THREE.InstancedMesh; freeSlots: number[]; active: number }>();
  private readonly material: THREE.MeshPhysicalMaterial;

  public constructor(options: RenderBatchOptions) {
    this.capacity = options.capacity ?? 128;
    this.material = options.material ?? createBrickMaterial();
    this.mesh = this.createChunk(options.parent, options.geometry, 0);
  }

  public add(brickId: string, transform: Transform, color: THREE.ColorRepresentation): void {
    if (this.brickToInstance.has(brickId)) {
      this.updateMatrix(brickId, transform);
      this.updateColor(brickId, color);
      return;
    }
    if (this.freeSlots.length === 0) this.createChunk(this.mesh.parent ?? new THREE.Group(), this.mesh.geometry, this.chunks.length);
    const slot = this.freeSlots.pop();
    if (slot === undefined) throw new Error(`Render batch capacity ${this.capacity} exceeded`);
    const chunk = this.chunkForSlot(slot);
    const localSlot = this.localSlot(slot);
    this.brickToInstance.set(brickId, slot);
    this.instanceToBrick.set(slot, brickId);
    this.transforms.set(brickId, toThreeMatrix(transform));
    chunk.mesh.setMatrixAt(localSlot, this.transforms.get(brickId) as THREE.Matrix4);
    chunk.mesh.setColorAt(localSlot, new THREE.Color(color));
    chunk.active += 1;
    chunk.mesh.instanceMatrix.needsUpdate = true;
    if (chunk.mesh.instanceColor !== null) chunk.mesh.instanceColor.needsUpdate = true;
  }

  public remove(brickId: string): boolean {
    const slot = this.brickToInstance.get(brickId);
    if (slot === undefined) {
      return false;
    }
    this.brickToInstance.delete(brickId);
    this.instanceToBrick.delete(slot);
    this.transforms.delete(brickId);
    this.hidden.delete(brickId);
    const chunk = this.chunkForSlot(slot);
    this.setHiddenMatrix(chunk.mesh, this.localSlot(slot));
    chunk.active = Math.max(0, chunk.active - 1);
    this.freeSlots.push(slot);
    chunk.mesh.instanceMatrix.needsUpdate = true;
    if (chunk.active === 0 && chunk.index > 0 && this.chunks[this.chunks.length - 1] === chunk) this.disposeChunk(chunk);
    return true;
  }

  public updateMatrix(brickId: string, transform: Transform): void {
    const slot = this.brickToInstance.get(brickId);
    if (slot === undefined) {
      return;
    }
    const matrix = toThreeMatrix(transform, this.transforms.get(brickId));
    this.transforms.set(brickId, matrix);
    if (!this.hidden.has(brickId)) {
      const chunk = this.chunkForSlot(slot);
      chunk.mesh.setMatrixAt(this.localSlot(slot), matrix);
      chunk.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  public updateColor(brickId: string, color: THREE.ColorRepresentation): void {
    const slot = this.brickToInstance.get(brickId);
    if (slot === undefined) {
      return;
    }
    const chunk = this.chunkForSlot(slot);
    chunk.mesh.setColorAt(this.localSlot(slot), new THREE.Color(color));
    if (chunk.mesh.instanceColor !== null) chunk.mesh.instanceColor.needsUpdate = true;
  }

  public replaceGeometry(geometry: THREE.BufferGeometry): void {
    for (const chunk of this.chunks) chunk.mesh.geometry = geometry;
  }

  public setHidden(brickId: string, hidden: boolean): void {
    const slot = this.brickToInstance.get(brickId);
    if (slot === undefined) {
      return;
    }
    if (hidden) {
      this.hidden.add(brickId);
      this.setHiddenMatrix(this.chunkForSlot(slot).mesh, this.localSlot(slot));
    } else {
      this.hidden.delete(brickId);
      const matrix = this.transforms.get(brickId);
      if (matrix !== undefined) {
        const chunk = this.chunkForSlot(slot);
        chunk.mesh.setMatrixAt(this.localSlot(slot), matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  public getBrickId(instanceId: number): string | undefined {
    return this.instanceToBrick.get(instanceId);
  }

  public getBrickIdForMesh(mesh: THREE.InstancedMesh, instanceId: number): string | undefined {
    const chunk = this.meshToChunk.get(mesh);
    return chunk === undefined ? undefined : this.instanceToBrick.get(chunk.index * this.capacity + instanceId);
  }

  public get chunkCount(): number { return this.chunks.length; }

  public dispose(disposeGeometry = true): void {
    for (const chunk of [...this.chunks]) this.disposeChunk(chunk);
    if (disposeGeometry) this.mesh.geometry.dispose();
    this.material.dispose();
  }

  private createChunk(parent: THREE.Object3D, geometry: THREE.BufferGeometry, index: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, this.material, this.capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
    const chunk = { index, mesh, freeSlots: [] as number[], active: 0 };
    this.chunks.push(chunk);
    this.meshes.push(mesh);
    this.meshToChunk.set(mesh, chunk);
    for (let localSlot = this.capacity - 1; localSlot >= 0; localSlot -= 1) {
      const globalSlot = index * this.capacity + localSlot;
      this.freeSlots.push(globalSlot);
      chunk.freeSlots.push(localSlot);
      mesh.setMatrixAt(localSlot, new THREE.Matrix4().makeScale(0, 0, 0));
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  private chunkForSlot(slot: number): { index: number; mesh: THREE.InstancedMesh; freeSlots: number[]; active: number } {
    const chunk = this.chunks[Math.floor(slot / this.capacity)];
    if (chunk === undefined) throw new Error(`Render batch slot ${slot} is unavailable`);
    return chunk;
  }

  private localSlot(slot: number): number { return slot % this.capacity; }

  private disposeChunk(chunk: { index: number; mesh: THREE.InstancedMesh; freeSlots: number[]; active: number }): void {
    if (!this.chunks.includes(chunk)) return;
    chunk.mesh.parent?.remove(chunk.mesh);
    this.meshToChunk.delete(chunk.mesh);
    const chunkIndex = this.chunks.indexOf(chunk);
    this.chunks.splice(chunkIndex, 1);
    this.meshes.splice(chunkIndex, 1);
    for (let localSlot = 0; localSlot < this.capacity; localSlot += 1) {
      const globalSlot = chunk.index * this.capacity + localSlot;
      const freeIndex = this.freeSlots.indexOf(globalSlot);
      if (freeIndex >= 0) this.freeSlots.splice(freeIndex, 1);
    }
    for (const [brickId, globalSlot] of this.brickToInstance) {
      if (Math.floor(globalSlot / this.capacity) === chunk.index) {
        this.brickToInstance.delete(brickId);
        this.instanceToBrick.delete(globalSlot);
      }
    }
  }

  private setHiddenMatrix(mesh: THREE.InstancedMesh, slot: number): void {
    mesh.setMatrixAt(slot, new THREE.Matrix4().makeScale(0, 0, 0));
  }
}
