import type { Transform } from "../math/transform.js";
import { cloneTransform } from "../math/transform.js";
import type { BrickInstance } from "./brick-instance.js";

export class BrickStore {
  private readonly bricks = new Map<string, BrickInstance>();

  public add(brick: BrickInstance): void {
    if (this.bricks.has(brick.id)) {
      throw new Error(`Brick ${brick.id} already exists`);
    }
    this.bricks.set(brick.id, cloneBrick(brick));
  }

  public upsert(brick: BrickInstance): void {
    this.bricks.set(brick.id, cloneBrick(brick));
  }

  public get(brickId: string): BrickInstance {
    const brick = this.bricks.get(brickId);
    if (brick === undefined) {
      throw new Error(`Brick ${brickId} does not exist`);
    }
    return cloneBrick(brick);
  }

  public tryGet(brickId: string): BrickInstance | undefined {
    const brick = this.bricks.get(brickId);
    return brick === undefined ? undefined : cloneBrick(brick);
  }

  public has(brickId: string): boolean {
    return this.bricks.has(brickId);
  }

  public setTransform(brickId: string, transform: Transform): void {
    const brick = this.bricks.get(brickId);
    if (brick === undefined) {
      throw new Error(`Brick ${brickId} does not exist`);
    }
    brick.transform = cloneTransform(transform);
  }

  public setColor(brickId: string, colorId: string): void {
    const brick = this.bricks.get(brickId);
    if (brick === undefined) {
      throw new Error(`Brick ${brickId} does not exist`);
    }
    brick.colorId = colorId;
  }

  public delete(brickId: string): BrickInstance {
    const brick = this.get(brickId);
    this.bricks.delete(brickId);
    return brick;
  }

  public clear(): void {
    this.bricks.clear();
  }

  public values(): BrickInstance[] {
    return [...this.bricks.values()].map(cloneBrick);
  }

  public get size(): number {
    return this.bricks.size;
  }
}

const cloneBrick = (brick: BrickInstance): BrickInstance => ({
  ...brick,
  transform: cloneTransform(brick.transform)
});
