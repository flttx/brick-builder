import type { BrickInstance } from "../parts/brick-instance.js";
import type { Command, EngineCommandContext } from "./command.js";

export class AddBrickCommand implements Command {
  public readonly name = "add-brick";

  public constructor(private readonly context: EngineCommandContext, private readonly brick: BrickInstance) {}

  public execute(): void {
    this.context.addBrick(this.brick);
  }

  public undo(): void {
    this.context.removeBrick(this.brick.id);
  }
}
