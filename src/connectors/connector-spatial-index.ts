import type { WorldConnector } from "./connector.js";
import type { Vec3 } from "../math/vec3.js";
import { SpatialHash } from "../spatial/spatial-hash.js";

export class ConnectorSpatialIndex {
  private readonly hash: SpatialHash<WorldConnector>;

  public constructor(cellSize = 1) {
    this.hash = new SpatialHash<WorldConnector>(cellSize);
  }

  public insert(connector: WorldConnector): void {
    this.hash.insert({
      id: this.entryId(connector),
      position: connector.worldPosition,
      value: cloneWorldConnector(connector)
    });
  }

  public insertMany(connectors: WorldConnector[]): void {
    for (const connector of connectors) {
      this.insert(connector);
    }
  }

  public remove(brickId: string, connectorId: string): boolean {
    return this.hash.remove(`${brickId}:${connectorId}`);
  }

  public removeBrick(brickId: string): void {
    for (const entry of this.hash.values()) {
      if (entry.value.brickId === brickId) {
        this.hash.remove(entry.id);
      }
    }
  }

  public update(connector: WorldConnector): void {
    this.insert(connector);
  }

  public updateBrick(connectors: WorldConnector[]): void {
    const brickId = connectors[0]?.brickId;
    if (brickId !== undefined) {
      this.removeBrick(brickId);
      this.insertMany(connectors);
    }
  }

  public query(center: Vec3, radius: number, excludeBrickId?: string): WorldConnector[] {
    return this.hash
      .query(center, radius)
      .filter((entry) => excludeBrickId === undefined || entry.value.brickId !== excludeBrickId)
      .map((entry) => entry.value);
  }

  public nearby(center: Vec3, radius: number, excludeBrickId?: string): WorldConnector[] {
    return this.query(center, radius, excludeBrickId);
  }

  public values(): WorldConnector[] {
    return this.hash.values().map((entry) => cloneWorldConnector(entry.value));
  }

  public get size(): number {
    return this.hash.size;
  }

  public clear(): void {
    this.hash.clear();
  }

  private entryId(connector: WorldConnector): string {
    return `${connector.brickId}:${connector.id}`;
  }
}

const cloneWorldConnector = (connector: WorldConnector): WorldConnector => ({
  ...connector,
  position: { ...connector.position },
  rotation: { ...connector.rotation },
  normal: { ...connector.normal },
  worldPosition: { ...connector.worldPosition },
  worldRotation: { ...connector.worldRotation },
  worldNormal: { ...connector.worldNormal }
});
