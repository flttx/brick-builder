import type { BrickInstance } from "../parts/brick-instance.js";
import type { Transform } from "../math/transform.js";
import type { ConnectionGroup } from "../connections/connection-types.js";

export interface EngineCommandContext {
  addBrick(brick: BrickInstance): void;
  removeBrick(brickId: string): BrickInstance;
  setTransform(brickId: string, transform: Transform): void;
  setColor(brickId: string, colorId: string): void;
  getBrick(brickId: string): BrickInstance;
  getConnections(brickId: string): ConnectionGroup[];
  replaceConnections(brickId: string, groups: ConnectionGroup[]): void;
}

export interface Command {
  readonly name: string;
  execute(): void;
  undo(): void;
}
