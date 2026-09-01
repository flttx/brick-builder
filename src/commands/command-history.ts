import type { Command } from "./command.js";

export class CommandHistory {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];

  public constructor(private readonly limit = 200) {}

  public execute(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack.length = 0;
    this.trim();
  }

  public recordExecuted(command: Command): void {
    this.undoStack.push(command);
    this.redoStack.length = 0;
    this.trim();
  }

  public undo(): boolean {
    const command = this.undoStack.pop();
    if (command === undefined) {
      return false;
    }
    command.undo();
    this.redoStack.push(command);
    return true;
  }

  public redo(): boolean {
    const command = this.redoStack.pop();
    if (command === undefined) {
      return false;
    }
    command.execute();
    this.undoStack.push(command);
    return true;
  }

  public clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  public get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public get size(): number {
    return this.undoStack.length;
  }

  public get redoSize(): number { return this.redoStack.length; }
  public get maxSize(): number { return this.limit; }

  private trim(): void {
    while (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
  }
}
