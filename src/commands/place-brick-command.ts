import type { ConnectionGroup } from "../connections/connection-types.js";
import { cloneGroup } from "../connections/connection-graph.js";
import { cloneTransform, type Transform } from "../math/transform.js";
import type { Command, EngineCommandContext } from "./command.js";

export class PlaceBrickCommand implements Command {
  public readonly name = "place-brick";

  public constructor(
    private readonly context: EngineCommandContext,
    private readonly brickId: string,
    private readonly beforeTransform: Transform,
    private readonly afterTransform: Transform,
    private readonly beforeConnections: ConnectionGroup[],
    private readonly afterConnections: ConnectionGroup[]
  ) {}

  public execute(): void {
    this.context.setTransform(this.brickId, this.afterTransform);
    this.context.replaceConnections(this.brickId, this.afterConnections.map(cloneGroup));
  }

  public undo(): void {
    this.context.setTransform(this.brickId, this.beforeTransform);
    this.context.replaceConnections(this.brickId, this.beforeConnections.map(cloneGroup));
  }
}

export const clonePlacementState = (transform: Transform, connections: ConnectionGroup[]): { transform: Transform; connections: ConnectionGroup[] } => ({
  transform: cloneTransform(transform),
  connections: connections.map(cloneGroup)
});
