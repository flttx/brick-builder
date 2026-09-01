import type { ConnectionGroup } from "../connections/connection-types.js";
import type { BrickInstance } from "../parts/brick-instance.js";
import type { Command, EngineCommandContext } from "./command.js";
import { cloneGroup } from "../connections/connection-graph.js";

export class DeleteBrickCommand implements Command {
  public readonly name = "delete-brick";

  public constructor(
    private readonly context: EngineCommandContext,
    private readonly brick: BrickInstance,
    private readonly connections: ConnectionGroup[]
  ) {}

  public execute(): void {
    this.context.removeBrick(this.brick.id);
  }

  public undo(): void {
    this.context.addBrick(this.brick);
    this.context.replaceConnections(this.brick.id, this.connections.map(cloneGroup));
  }
}
