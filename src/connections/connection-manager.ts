import type { ConnectorOccupancyIndex } from "../connectors/occupancy-index.js";
import type { ConnectorSystem } from "../connectors/connector-system.js";
import type { PartRegistry } from "../parts/part-registry.js";
import type { BrickStore } from "../parts/brick-store.js";
import type { ConnectionGraph } from "./connection-graph.js";
import type { ConnectionGroup, ConnectionPairReference } from "./connection-types.js";
import { angleBetweenVectors } from "../math/quat.js";
import { distance } from "../math/vec3.js";

export interface ConnectionManagerContext {
  parts: PartRegistry;
  bricks: BrickStore;
  connectors: ConnectorSystem;
  occupancy: ConnectorOccupancyIndex;
  graph: ConnectionGraph;
}

export class ConnectionManager {
  public constructor(private readonly context: ConnectionManagerContext) {}

  public connect(group: ConnectionGroup): void {
    this.validateGroup(group);
    const occupied: Array<{ brickId: string; connectorId: string }> = [];
    try {
      for (const pair of group.pairs) {
        const connectorA = this.getConnector(group.brickA, pair.connectorA);
        const connectorB = this.getConnector(group.brickB, pair.connectorB);
        if (!this.context.occupancy.canOccupy(connectorA, group.id) || !this.context.occupancy.canOccupy(connectorB, group.id)) {
          throw new Error(`Connection group ${group.id} contains an occupied connector`);
        }
        this.context.occupancy.occupyWorld(connectorA, group.id);
        occupied.push({ brickId: group.brickA, connectorId: pair.connectorA });
        this.context.occupancy.occupyWorld(connectorB, group.id);
        occupied.push({ brickId: group.brickB, connectorId: pair.connectorB });
      }
      this.context.graph.add(group);
    } catch (error) {
      for (const item of occupied) {
        this.context.occupancy.release(item.brickId, item.connectorId, group.id);
      }
      throw error;
    }
  }

  public disconnect(groupId: string): ConnectionGroup | undefined {
    const group = this.context.graph.remove(groupId);
    if (group !== undefined) {
      this.context.occupancy.releaseGroup(groupId);
    }
    return group;
  }

  public disconnectForBrick(brickId: string): ConnectionGroup[] {
    const groups = this.context.graph.getForBrick(brickId);
    for (const group of groups) {
      this.disconnect(group.id);
    }
    return groups;
  }

  public restore(groups: ConnectionGroup[]): void {
    for (const group of groups) {
      if (this.context.graph.tryGet(group.id) === undefined) {
        this.connect(group);
      }
    }
  }

  public createGroup(id: string, brickA: string, brickB: string, pairs: ConnectionPairReference[]): ConnectionGroup {
    return { id, brickA, brickB, type: "rigid", pairs: pairs.map((pair) => ({ ...pair })) };
  }

  public getForBrick(brickId: string): ConnectionGroup[] {
    return this.context.graph.getForBrick(brickId);
  }

  public getNeighbors(brickId: string): string[] {
    return this.context.graph.getNeighbors(brickId);
  }

  private validateGroup(group: ConnectionGroup): void {
    if (group.type !== "rigid" || group.brickA === group.brickB || group.pairs.length === 0) {
      throw new Error(`Invalid connection group ${group.id}`);
    }
    if (!this.context.bricks.has(group.brickA) || !this.context.bricks.has(group.brickB)) {
      throw new Error(`Connection group ${group.id} references a missing brick`);
    }
    const seen = new Set<string>();
    for (const pair of group.pairs) {
      const keyA = `${group.brickA}:${pair.connectorA}`;
      const keyB = `${group.brickB}:${pair.connectorB}`;
      if (seen.has(keyA) || seen.has(keyB)) {
        throw new Error(`Connection group ${group.id} repeats a connector`);
      }
      seen.add(keyA);
      seen.add(keyB);
      const connectorA = this.getConnector(group.brickA, pair.connectorA);
      const connectorB = this.getConnector(group.brickB, pair.connectorB);
      const rule = this.context.connectors.compatibility.getRule(connectorA.type, connectorB.type);
      if (
        rule === undefined ||
        !this.context.connectors.compatibility.areCompatible(connectorA, connectorB, distance(connectorA.worldPosition, connectorB.worldPosition)) ||
        angleBetweenVectors(connectorA.worldNormal, {
          x: -connectorB.worldNormal.x,
          y: -connectorB.worldNormal.y,
          z: -connectorB.worldNormal.z
        }) > rule.maxAngle
      ) {
        throw new Error(`Connection group ${group.id} contains incompatible connectors`);
      }
    }
  }

  private getConnector(brickId: string, connectorId: string) {
    const brick = this.context.bricks.get(brickId);
    const part = this.context.parts.get(brick.partId);
    return this.context.connectors.getWorldConnector(brick, part, connectorId);
  }
}
