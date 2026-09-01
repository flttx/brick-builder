import type { AABB } from "../collision/aabb.js";
import type { Vec3 } from "../math/vec3.js";
import { SpatialHash } from "./spatial-hash.js";

export interface WorldCollider {
  id: string;
  brickId: string;
  colliderId: string;
  bounds: AABB;
  center: Vec3;
}

export class BrickSpatialIndex {
  private readonly hash: SpatialHash<WorldCollider>;
  private maxHalfExtent: Vec3 = { x: 0, y: 0, z: 0 };

  public constructor(cellSize = 1) {
    this.hash = new SpatialHash<WorldCollider>(cellSize);
  }

  public insert(collider: WorldCollider): void {
    this.maxHalfExtent = {
      x: Math.max(this.maxHalfExtent.x, (collider.bounds.max.x - collider.bounds.min.x) / 2),
      y: Math.max(this.maxHalfExtent.y, (collider.bounds.max.y - collider.bounds.min.y) / 2),
      z: Math.max(this.maxHalfExtent.z, (collider.bounds.max.z - collider.bounds.min.z) / 2)
    };
    this.hash.insert({
      id: collider.id,
      position: collider.center,
      value: cloneWorldCollider(collider)
    });
  }

  public insertMany(colliders: WorldCollider[]): void {
    for (const collider of colliders) {
      this.insert(collider);
    }
  }

  public remove(id: string): boolean {
    return this.hash.remove(id);
  }

  public removeBrick(brickId: string): void {
    for (const entry of this.hash.values()) {
      if (entry.value.brickId === brickId) {
        this.hash.remove(entry.id);
      }
    }
  }

  public update(colliders: WorldCollider[]): void {
    const brickId = colliders[0]?.brickId;
    if (brickId !== undefined) {
      this.removeBrick(brickId);
      this.insertMany(colliders);
    }
  }

  public queryAABB(bounds: AABB, excludeBrickId?: string): WorldCollider[] {
    const queryMin = {
      x: bounds.min.x - this.maxHalfExtent.x,
      y: bounds.min.y - this.maxHalfExtent.y,
      z: bounds.min.z - this.maxHalfExtent.z
    };
    const queryMax = {
      x: bounds.max.x + this.maxHalfExtent.x,
      y: bounds.max.y + this.maxHalfExtent.y,
      z: bounds.max.z + this.maxHalfExtent.z
    };
    return this.hash
      .queryBounds(
        queryMin,
        queryMax
      )
      .filter((entry) => {
        if (excludeBrickId !== undefined && entry.value.brickId === excludeBrickId) {
          return false;
        }
        return (
          entry.value.bounds.max.x >= bounds.min.x &&
          entry.value.bounds.min.x <= bounds.max.x &&
          entry.value.bounds.max.y >= bounds.min.y &&
          entry.value.bounds.min.y <= bounds.max.y &&
          entry.value.bounds.max.z >= bounds.min.z &&
          entry.value.bounds.min.z <= bounds.max.z
        );
      })
      .map((entry) => cloneWorldCollider(entry.value));
  }

  public values(): WorldCollider[] {
    return this.hash.values().map((entry) => cloneWorldCollider(entry.value));
  }

  public get size(): number {
    return this.hash.size;
  }

  public clear(): void {
    this.hash.clear();
    this.maxHalfExtent = { x: 0, y: 0, z: 0 };
  }
}

const cloneWorldCollider = (collider: WorldCollider): WorldCollider => ({
  ...collider,
  center: { ...collider.center },
  bounds: {
    min: { ...collider.bounds.min },
    max: { ...collider.bounds.max }
  }
});
