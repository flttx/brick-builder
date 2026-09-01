import type { ConnectionGraph } from "../connections/connection-graph.js";
import type { BrickStore } from "../parts/brick-store.js";

export interface BrickProjectSnapshot {
  version: 1;
  bricks: Array<{
    id: string;
    partId: string;
    colorId: string;
    position: [number, number, number];
    rotation: [number, number, number, number];
  }>;
  connections: Array<{
    id: string;
    brickA: string;
    brickB: string;
    pairs: Array<[string, string]>;
  }>;
}

export const serializeProject = (bricks: BrickStore, graph: ConnectionGraph): BrickProjectSnapshot => ({
  version: 1,
  bricks: bricks.values().sort((a, b) => a.id.localeCompare(b.id)).map((brick) => ({
    id: brick.id,
    partId: brick.partId,
    colorId: brick.colorId,
    position: [brick.transform.position.x, brick.transform.position.y, brick.transform.position.z],
    rotation: [brick.transform.rotation.x, brick.transform.rotation.y, brick.transform.rotation.z, brick.transform.rotation.w]
  })),
  connections: graph.values().sort((a, b) => a.id.localeCompare(b.id)).map((group) => ({
    id: group.id,
    brickA: group.brickA,
    brickB: group.brickB,
    pairs: group.pairs.map((pair) => [pair.connectorA, pair.connectorB])
  }))
});
