export type WebGLRecoveryState = "healthy" | "context_lost" | "recovering" | "failed";

export interface WebGLRecoveryCallbacks {
  saveLocal: () => Promise<void> | void;
  pause: () => void;
  resume: () => void;
  recreate: () => Promise<void> | void;
  onStateChange?: (state: WebGLRecoveryState) => void;
}

export class WebGLRecoveryController {
  private state: WebGLRecoveryState = "healthy";
  private attached = false;

  public constructor(private readonly canvas: Pick<HTMLCanvasElement, "addEventListener" | "removeEventListener">, private readonly callbacks: WebGLRecoveryCallbacks) {}

  public getState(): WebGLRecoveryState { return this.state; }

  public attach(): () => void {
    if (this.attached) return () => undefined;
    this.attached = true;
    this.canvas.addEventListener("webglcontextlost", this.handleLost);
    this.canvas.addEventListener("webglcontextrestored", this.handleRestored);
    return () => this.dispose();
  }

  public dispose(): void {
    if (!this.attached) return;
    this.canvas.removeEventListener("webglcontextlost", this.handleLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleRestored);
    this.attached = false;
  }

  public async recover(): Promise<void> {
    this.setState("recovering");
    try {
      await this.callbacks.recreate();
      this.callbacks.resume();
      this.setState("healthy");
    } catch {
      this.setState("failed");
    }
  }

  private readonly handleLost = (event: Event): void => {
    event.preventDefault();
    this.setState("context_lost");
    this.callbacks.pause();
    void Promise.resolve(this.callbacks.saveLocal()).catch(() => undefined);
  };

  private readonly handleRestored = (): void => { void this.recover(); };
  private setState(state: WebGLRecoveryState): void { this.state = state; this.callbacks.onStateChange?.(state); }
}
