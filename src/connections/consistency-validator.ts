import { connectorKey } from "../connectors/connector.js";
import type { ConnectorOccupancyIndex } from "../connectors/occupancy-index.js";
import type { ConnectorSpatialIndex } from "../connectors/connector-spatial-index.js";
import type { BrickSpatialIndex } from "../spatial/brick-spatial-index.js";
import type { PartRegistry } from "../parts/part-registry.js";
import type { BrickStore } from "../parts/brick-store.js";
import type { ConnectionGraph } from "./connection-graph.js";
import type { ConnectorSystem } from "../connectors/connector-system.js";
import { angleBetweenVectors } from "../math/quat.js";
import { distance } from "../math/vec3.js";

export interface ConsistencyContext {
  parts: PartRegistry;
  bricks: BrickStore;
  graph: ConnectionGraph;
  occupancy: ConnectorOccupancyIndex;
  connectorSpatial: ConnectorSpatialIndex;
  brickSpatial: BrickSpatialIndex;
  connectors: ConnectorSystem;
}

export interface ConsistencyResult {
  valid: boolean;
  errors: string[];
}

export class ConsistencyValidator {
  public constructor(private readonly context: ConsistencyContext) {}

  public validate(): ConsistencyResult {
    const errors: string[] = [];
    const expectedOccupancy = new Map<string, string[]>();
    const groupIds = new Set<string>();
    for (const group of this.context.graph.values()) {
      if (groupIds.has(group.id)) {
        errors.push(`Duplicate connection group ${group.id}`);
      }
      groupIds.add(group.id);
      if (!this.context.bricks.has(group.brickA) || !this.context.bricks.has(group.brickB)) {
        errors.push(`Connection ${group.id} references a missing brick`);
        continue;
      }
      if (group.type !== "rigid" || group.brickA === group.brickB || group.pairs.length === 0) {
        errors.push(`Connection ${group.id} has invalid group metadata`);
      }
      const brickA = this.context.bricks.get(group.brickA);
      const brickB = this.context.bricks.get(group.brickB);
      const partA = this.context.parts.get(brickA.partId);
      const partB = this.context.parts.get(brickB.partId);
      const connectorAIds = new Set(partA.connectors.map((connector) => connector.id));
      const connectorBIds = new Set(partB.connectors.map((connector) => connector.id));
      const pairKeys = new Set<string>();
      for (const pair of group.pairs) {
        if (!connectorAIds.has(pair.connectorA) || !connectorBIds.has(pair.connectorB)) {
          errors.push(`Connection ${group.id} references a missing connector`);
          continue;
        }
        const connectorA = partA.connectors.find((connector) => connector.id === pair.connectorA);
        const connectorB = partB.connectors.find((connector) => connector.id === pair.connectorB);
        if (connectorA === undefined || connectorB === undefined) {
          errors.push(`Connection ${group.id} connector lookup failed`);
          continue;
        }
        const pairKey = `${pair.connectorA}:${pair.connectorB}`;
        if (pairKeys.has(pairKey)) {
          errors.push(`Connection ${group.id} repeats a connector pair`);
        }
        pairKeys.add(pairKey);
        const worldA = this.context.connectors.getWorldConnector(brickA, partA, pair.connectorA);
        const worldB = this.context.connectors.getWorldConnector(brickB, partB, pair.connectorB);
        const rule = this.context.connectors.compatibility.getRule(worldA.type, worldB.type);
        if (
          rule === undefined ||
          !this.context.connectors.compatibility.areCompatible(worldA, worldB, distance(worldA.worldPosition, worldB.worldPosition)) ||
          angleBetweenVectors(worldA.worldNormal, {
            x: -worldB.worldNormal.x,
            y: -worldB.worldNormal.y,
            z: -worldB.worldNormal.z
          }) > rule.maxAngle
        ) {
          errors.push(`Connection ${group.id} contains incompatible connectors`);
        }
        this.addExpected(expectedOccupancy, connectorKey(group.brickA, pair.connectorA), group.id);
        this.addExpected(expectedOccupancy, connectorKey(group.brickB, pair.connectorB), group.id);
      }
    }
    const actualOccupancy = new Map(this.context.occupancy.records().map((record) => [
      connectorKey(record.brickId, record.connectorId),
      record.groupIds
    ]));
    for (const [key, expected] of expectedOccupancy) {
      const actual = actualOccupancy.get(key) ?? [];
      if (actual.join(",") !== expected.sort().join(",")) {
        errors.push(`Occupancy mismatch for ${key}`);
      }
      if (!this.context.bricks.has(key.split(":")[0] ?? "")) {
        errors.push(`Occupancy references a missing brick for ${key}`);
      }
    }
    for (const [key, actual] of actualOccupancy) {
      if (!expectedOccupancy.has(key)) {
        errors.push(`Orphan occupancy for ${key}`);
      }
      if (actual.length !== new Set(actual).size) {
        errors.push(`Duplicate occupancy for ${key}`);
      }
      for (const groupId of actual) {
        if (this.context.graph.tryGet(groupId) === undefined) {
          errors.push(`Occupancy ${key} references missing group ${groupId}`);
        }
      }
    }
    for (const connector of this.context.connectorSpatial.values()) {
      if (!this.context.bricks.has(connector.brickId)) {
        errors.push(`Connector spatial index references missing brick ${connector.brickId}`);
      } else {
        const part = this.context.parts.get(connector.partId);
        if (!part.connectors.some((candidate) => candidate.id === connector.id)) {
          errors.push(`Connector spatial index references missing connector ${connector.brickId}:${connector.id}`);
        }
      }
    }
    for (const collider of this.context.brickSpatial.values()) {
      if (!this.context.bricks.has(collider.brickId)) {
        errors.push(`Brick spatial index references missing brick ${collider.brickId}`);
      }
    }
    return { valid: errors.length === 0, errors: [...new Set(errors)] };
  }

  private addExpected(map: Map<string, string[]>, key: string, groupId: string): void {
    const groups = map.get(key) ?? [];
    groups.push(groupId);
    map.set(key, groups);
  }
}
