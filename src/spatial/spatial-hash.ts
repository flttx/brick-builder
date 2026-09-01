import type { Vec3 } from "../math/vec3.js";

export interface SpatialEntry<T> {
  id: string;
  position: Vec3;
  value: T;
}

interface CellCoordinate {
  x: number;
  y: number;
  z: number;
}

export class SpatialHash<T> {
  private readonly cells = new Map<string, Set<string>>();
  private readonly entries = new Map<string, SpatialEntry<T>>();

  public constructor(public readonly cellSize = 1) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new Error("Spatial hash cellSize must be positive");
    }
  }

  public insert(entry: SpatialEntry<T>): void {
    this.remove(entry.id);
    this.entries.set(entry.id, {
      id: entry.id,
      position: { ...entry.position },
      value: entry.value
    });
    const key = this.cellKey(this.coordinate(entry.position));
    const ids = this.cells.get(key) ?? new Set<string>();
    ids.add(entry.id);
    this.cells.set(key, ids);
  }

  public remove(id: string): boolean {
    const entry = this.entries.get(id);
    if (entry === undefined) {
      return false;
    }
    this.entries.delete(id);
    const key = this.cellKey(this.coordinate(entry.position));
    const ids = this.cells.get(key);
    ids?.delete(id);
    if (ids !== undefined && ids.size === 0) {
      this.cells.delete(key);
    }
    return true;
  }

  public update(entry: SpatialEntry<T>): void {
    this.insert(entry);
  }

  public query(center: Vec3, radius: number, excludeId?: string): SpatialEntry<T>[] {
    if (radius < 0) {
      return [];
    }
    return this.queryBoundsInternal(
      { x: center.x - radius, y: center.y - radius, z: center.z - radius },
      { x: center.x + radius, y: center.y + radius, z: center.z + radius },
      excludeId,
      center,
      radius
    );
  }

  public queryBounds(min: Vec3, max: Vec3, excludeId?: string): SpatialEntry<T>[] {
    return this.queryBoundsInternal(min, max, excludeId);
  }

  private queryBoundsInternal(minimumPosition: Vec3, maximumPosition: Vec3, excludeId?: string, center?: Vec3, radius?: number): SpatialEntry<T>[] {
    const minimum = this.coordinate(minimumPosition);
    const maximum = this.coordinate(maximumPosition);
    const result: SpatialEntry<T>[] = [];
    for (let x = minimum.x; x <= maximum.x; x += 1) {
      for (let y = minimum.y; y <= maximum.y; y += 1) {
        for (let z = minimum.z; z <= maximum.z; z += 1) {
          const ids = this.cells.get(this.cellKey({ x, y, z }));
          if (ids === undefined) {
            continue;
          }
          for (const id of ids) {
            if (id === excludeId) {
              continue;
            }
            const entry = this.entries.get(id);
            if (entry !== undefined) {
              const withinRadius = center === undefined || radius === undefined ||
                (entry.position.x - center.x) ** 2 +
                  (entry.position.y - center.y) ** 2 +
                  (entry.position.z - center.z) ** 2 <= radius * radius;
              if (withinRadius) {
                result.push(cloneEntry(entry));
              }
            }
          }
        }
      }
    }
    return result;
  }

  public values(): SpatialEntry<T>[] {
    return [...this.entries.values()].map(cloneEntry);
  }

  public get size(): number {
    return this.entries.size;
  }

  public clear(): void {
    this.cells.clear();
    this.entries.clear();
  }

  private coordinate(position: Vec3): CellCoordinate {
    return {
      x: Math.floor(position.x / this.cellSize),
      y: Math.floor(position.y / this.cellSize),
      z: Math.floor(position.z / this.cellSize)
    };
  }

  private cellKey(coordinate: CellCoordinate): string {
    return `${coordinate.x},${coordinate.y},${coordinate.z}`;
  }
}

const cloneEntry = <T>(entry: SpatialEntry<T>): SpatialEntry<T> => ({
  id: entry.id,
  position: { ...entry.position },
  value: entry.value
});
