export type FrameLoopMode = "continuous" | "demand";

export class FrameCoordinator {
  private paused = false;
  private pending = false;
  private readonly listeners = new Set<() => void>();

  public constructor(private mode: FrameLoopMode = "continuous") {}

  public subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  public setMode(mode: FrameLoopMode): void { this.mode = mode; }
  public getMode(): FrameLoopMode { return this.mode; }
  public pause(): void { this.paused = true; }
  public resume(): void { this.paused = false; this.requestFrame(); }
  public isPaused(): boolean { return this.paused; }
  public requestFrame(): void {
    if (this.paused) return;
    this.pending = true;
    for (const listener of this.listeners) listener();
  }
  public consumeFrameRequest(): boolean {
    if (this.mode === "continuous") return !this.paused;
    const requested = this.pending;
    this.pending = false;
    return requested && !this.paused;
  }
}

