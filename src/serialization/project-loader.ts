import { identity } from "../math/quat.js";
import type { BrickInstance } from "../parts/brick-instance.js";
import type { BrickStore } from "../parts/brick-store.js";
import type { ConnectionManager } from "../connections/connection-manager.js";
import type { ConnectionGraph } from "../connections/connection-graph.js";
import type { BrickProjectSnapshot } from "./project-snapshot.js";
import type { PartRegistry } from "../parts/part-registry.js";
import type { ConnectionGroup } from "../connections/connection-types.js";
import type { ConnectorOccupancyIndex } from "../connectors/occupancy-index.js";

export interface ProjectLoaderContext {
  parts: PartRegistry;
  bricks: BrickStore;
  graph: ConnectionGraph;
  connections: ConnectionManager;
  occupancy: ConnectorOccupancyIndex;
  rebuildIndexes(): void;
  validate(): { valid: boolean; errors: string[] };
  ensurePart?: (partId: string) => void;
}

export class ProjectLoader {
  public constructor(private readonly context: ProjectLoaderContext) {}

  public load(snapshot: BrickProjectSnapshot): void {
    if (snapshot.version !== 1) {
      throw new Error(`Unsupported project snapshot version ${snapshot.version}`);
    }
    for (const brick of snapshot.bricks) {
      if (!this.context.parts.has(brick.partId)) {
        if (this.context.ensurePart === undefined) throw new Error(`Snapshot references unknown part ${brick.partId}`);
        this.context.ensurePart(brick.partId);
      }
    }
    const bricks: BrickInstance[] = snapshot.bricks.map((brick) => ({
      id: brick.id,
      partId: brick.partId,
      colorId: brick.colorId,
      transform: {
        position: { x: brick.position[0], y: brick.position[1], z: brick.position[2] },
        rotation: {
          x: brick.rotation[0],
          y: brick.rotation[1],
          z: brick.rotation[2],
          w: brick.rotation[3]
        }
      }
    }));
    const groups: ConnectionGroup[] = snapshot.connections.map((connection) => ({
      id: connection.id,
      brickA: connection.brickA,
      brickB: connection.brickB,
      type: "rigid",
      pairs: connection.pairs.map(([connectorA, connectorB]) => ({ connectorA, connectorB }))
    }));
    this.context.bricks.clear();
    this.context.graph.clear();
    this.context.occupancy.clear();
    this.context.rebuildIndexes();
    try {
      for (const brick of bricks) {
        this.context.bricks.add(brick);
      }
      this.context.rebuildIndexes();
      this.context.connections.restore(groups);
      const result = this.context.validate();
      if (!result.valid) {
        throw new Error(`Loaded snapshot is inconsistent: ${result.errors.join("; ")}`);
      }
    } catch (error) {
      this.context.bricks.clear();
      this.context.graph.clear();
      this.context.occupancy.clear();
      this.context.rebuildIndexes();
      throw error;
    }
  }
}

export const snapshotRotation = (snapshot: BrickProjectSnapshot, brickId: string) => {
  const brick = snapshot.bricks.find((candidate) => candidate.id === brickId);
  return brick === undefined ? identity() : {
    x: brick.rotation[0],
    y: brick.rotation[1],
    z: brick.rotation[2],
    w: brick.rotation[3]
  };
};
