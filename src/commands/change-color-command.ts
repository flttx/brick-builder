import type { Command, EngineCommandContext } from "./command.js";

export class ChangeColorCommand implements Command {
  public readonly name = "change-color";

  public constructor(
    private readonly context: EngineCommandContext,
    private readonly brickId: string,
    private readonly beforeColorId: string,
    private readonly afterColorId: string
  ) {}

  public execute(): void {
    this.context.setColor(this.brickId, this.afterColorId);
  }

  public undo(): void {
    this.context.setColor(this.brickId, this.beforeColorId);
  }
}
