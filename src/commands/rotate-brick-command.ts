import type { Transform } from "../math/transform.js";
import type { ConnectionGroup } from "../connections/connection-types.js";
import type { Command, EngineCommandContext } from "./command.js";

export class RotateBrickCommand implements Command {
  public readonly name = "rotate-brick";

  public constructor(
    private readonly context: EngineCommandContext,
    private readonly brickId: string,
    private readonly beforeTransform: Transform,
    private readonly afterTransform: Transform,
    private readonly connections: ConnectionGroup[] = []
  ) {}

  public execute(): void {
    this.context.setTransform(this.brickId, this.afterTransform);
    if (this.connections.length > 0) {
      this.context.replaceConnections(this.brickId, this.connections);
    }
  }

  public undo(): void {
    this.context.setTransform(this.brickId, this.beforeTransform);
    if (this.connections.length > 0) {
      this.context.replaceConnections(this.brickId, this.connections);
    }
  }
}
