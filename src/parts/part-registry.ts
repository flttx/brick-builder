import type { PartDefinition } from "./part-definition.js";

export class PartRegistry {
  private readonly definitions = new Map<string, PartDefinition>();

  public register(definition: PartDefinition): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Part ${definition.id} is already registered`);
    }
    this.definitions.set(definition.id, clonePartDefinition(definition));
  }

  public upsert(definition: PartDefinition): void {
    this.definitions.set(definition.id, clonePartDefinition(definition));
  }

  public get(partId: string): PartDefinition {
    const definition = this.definitions.get(partId);
    if (definition === undefined) {
      throw new Error(`Part ${partId} is not registered`);
    }
    return clonePartDefinition(definition);
  }

  public tryGet(partId: string): PartDefinition | undefined {
    const definition = this.definitions.get(partId);
    return definition === undefined ? undefined : clonePartDefinition(definition);
  }

  public has(partId: string): boolean {
    return this.definitions.has(partId);
  }

  public values(): PartDefinition[] {
    return [...this.definitions.values()].map(clonePartDefinition);
  }

  public clear(): void {
    this.definitions.clear();
  }
}

const clonePartDefinition = (definition: PartDefinition): PartDefinition => {
  const clone: PartDefinition = {
    id: definition.id,
    name: definition.name,
    category: definition.category,
    dimensions: { ...definition.dimensions },
    origin: { ...definition.origin },
    connectors: definition.connectors.map((connector) => ({
      ...connector,
      position: { ...connector.position },
      rotation: { ...connector.rotation },
      normal: { ...connector.normal }
    })),
    colliders: definition.colliders.map((collider) => ({
      ...collider,
      center: { ...collider.center },
      size: { ...collider.size }
    }))
  };
  if (definition.visual !== undefined) {
    clone.visual = { ...definition.visual };
  }
  if (definition.version !== undefined) {
    clone.version = definition.version;
  }
  if (definition.asset !== undefined) {
    clone.asset = { ...definition.asset };
  }
  if (definition.metadata !== undefined) {
    clone.metadata = { ...definition.metadata };
  }
  return clone;
};
