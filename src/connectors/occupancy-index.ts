import type { ConnectorDefinition, WorldConnector } from "./connector.js";
import { connectorKey } from "./connector.js";

export interface OccupancyRecord {
  brickId: string;
  connectorId: string;
  groupIds: string[];
}

export class ConnectorOccupancyIndex {
  private readonly occupied = new Map<string, Set<string>>();

  public isOccupied(brickId: string, connectorId: string): boolean {
    return (this.occupied.get(connectorKey(brickId, connectorId))?.size ?? 0) > 0;
  }

  public getGroupIds(brickId: string, connectorId: string): string[] {
    return [...(this.occupied.get(connectorKey(brickId, connectorId)) ?? [])].sort();
  }

  public canOccupy(connector: WorldConnector, groupId: string): boolean;
  public canOccupy(brickId: string, connector: ConnectorDefinition, groupId: string): boolean;
  public canOccupy(
    brickOrConnector: string | WorldConnector,
    connectorOrGroup: ConnectorDefinition | string,
    possibleGroupId?: string
  ): boolean {
    const isWorldConnector = typeof brickOrConnector !== "string";
    const brickId = isWorldConnector ? brickOrConnector.brickId : brickOrConnector;
    const connector = isWorldConnector ? brickOrConnector : connectorOrGroup as ConnectorDefinition;
    const groupId = isWorldConnector ? connectorOrGroup as string : possibleGroupId;
    if (groupId === undefined) {
      throw new Error("Occupancy groupId is required");
    }
    const existing = this.occupied.get(connectorKey(brickId, connector.id));
    if (connector.occupiedRule === "multi") {
      return existing === undefined || !existing.has(groupId);
    }
    return existing === undefined || existing.size === 0 || (existing.size === 1 && existing.has(groupId));
  }

  public occupy(brickId: string, connector: ConnectorDefinition, groupId: string): void {
    const key = connectorKey(brickId, connector.id);
    const existing = this.occupied.get(key) ?? new Set<string>();
    if (connector.occupiedRule === "single" && existing.size > 0 && !existing.has(groupId)) {
      throw new Error(`Connector ${key} is already occupied`);
    }
    existing.add(groupId);
    this.occupied.set(key, existing);
  }

  public occupyWorld(connector: WorldConnector, groupId: string): void {
    this.occupy(connector.brickId, connector, groupId);
  }

  public release(brickId: string, connectorId: string, groupId: string): void {
    const key = connectorKey(brickId, connectorId);
    const existing = this.occupied.get(key);
    if (existing === undefined) {
      return;
    }
    existing.delete(groupId);
    if (existing.size === 0) {
      this.occupied.delete(key);
    }
  }

  public releaseGroup(groupId: string): void {
    for (const [key, groupIds] of this.occupied) {
      groupIds.delete(groupId);
      if (groupIds.size === 0) {
        this.occupied.delete(key);
      }
    }
  }

  public clear(): void {
    this.occupied.clear();
  }

  public records(): OccupancyRecord[] {
    return [...this.occupied.entries()]
      .map(([key, groupIds]) => {
        const separator = key.indexOf(":");
        return {
          brickId: key.slice(0, separator),
          connectorId: key.slice(separator + 1),
          groupIds: [...groupIds].sort()
        };
      })
      .sort((a, b) => `${a.brickId}:${a.connectorId}`.localeCompare(`${b.brickId}:${b.connectorId}`));
  }

  public hasExactGroup(brickId: string, connectorId: string, groupId: string): boolean {
    return this.occupied.get(connectorKey(brickId, connectorId))?.has(groupId) ?? false;
  }
}
