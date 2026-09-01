import { cloneGroup } from "../connections/connection-graph.js";
import type { ConnectionGroup } from "../connections/connection-types.js";
import type { BrickInstance } from "../parts/brick-instance.js";
import type { Command, EngineCommandContext } from "./command.js";

export class AddPlacedBrickCommand implements Command {
  public readonly name = "add-placed-brick";

  public constructor(
    private readonly context: EngineCommandContext,
    private readonly brick: BrickInstance,
    private readonly connections: ConnectionGroup[] = []
  ) {}

  public execute(): void {
    this.context.addBrick(this.brick);
    try {
      this.context.replaceConnections(this.brick.id, this.connections.map(cloneGroup));
    } catch (error) {
      this.context.removeBrick(this.brick.id);
      throw error;
    }
  }

  public undo(): void {
    this.context.removeBrick(this.brick.id);
  }
}
