import type { ConnectionGroup } from "./connection-types.js";

export class ConnectionGraph {
  private readonly groups = new Map<string, ConnectionGroup>();

  public add(group: ConnectionGroup): void {
    if (this.groups.has(group.id)) {
      throw new Error(`Connection group ${group.id} already exists`);
    }
    this.groups.set(group.id, cloneGroup(group));
  }

  public upsert(group: ConnectionGroup): void {
    this.groups.set(group.id, cloneGroup(group));
  }

  public remove(groupId: string): ConnectionGroup | undefined {
    const group = this.groups.get(groupId);
    this.groups.delete(groupId);
    return group === undefined ? undefined : cloneGroup(group);
  }

  public get(groupId: string): ConnectionGroup {
    const group = this.groups.get(groupId);
    if (group === undefined) {
      throw new Error(`Connection group ${groupId} does not exist`);
    }
    return cloneGroup(group);
  }

  public tryGet(groupId: string): ConnectionGroup | undefined {
    const group = this.groups.get(groupId);
    return group === undefined ? undefined : cloneGroup(group);
  }

  public getForBrick(brickId: string): ConnectionGroup[] {
    return [...this.groups.values()]
      .filter((group) => group.brickA === brickId || group.brickB === brickId)
      .map(cloneGroup);
  }

  public getNeighbors(brickId: string): string[] {
    return [...new Set(this.getForBrick(brickId).map((group) => group.brickA === brickId ? group.brickB : group.brickA))].sort();
  }

  public getConnectedComponent(brickId: string): string[] {
    const visited = new Set<string>();
    const queue = [brickId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined || visited.has(current)) {
        continue;
      }
      visited.add(current);
      for (const neighbor of this.getNeighbors(current)) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
    return [...visited].sort();
  }

  public values(): ConnectionGroup[] {
    return [...this.groups.values()].map(cloneGroup);
  }

  public get size(): number {
    return this.groups.size;
  }

  public clear(): void {
    this.groups.clear();
  }
}

export const cloneGroup = (group: ConnectionGroup): ConnectionGroup => ({
  ...group,
  pairs: group.pairs.map((pair) => ({ ...pair }))
});
