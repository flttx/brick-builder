export type FaultName = "failNextAssetLoad" | "failNextCloudSave" | "force409" | "loseWebGLContext" | "simulateOffline" | "corruptTestDraft";

export interface FaultState {
  failNextAssetLoad: boolean;
  failNextCloudSave: boolean;
  force409: boolean;
  loseWebGLContext: boolean;
  simulateOffline: boolean;
  corruptTestDraft: boolean;
}

export class FaultInjectionController {
  private readonly enabled: boolean;
  private state: FaultState = { failNextAssetLoad: false, failNextCloudSave: false, force409: false, loseWebGLContext: false, simulateOffline: false, corruptTestDraft: false };
  private readonly listeners = new Set<(state: FaultState) => void>();

  public constructor(enabled: boolean) { this.enabled = enabled; }
  public getState(): FaultState { return { ...this.state }; }
  public subscribe(listener: (state: FaultState) => void): () => void { this.listeners.add(listener); listener(this.getState()); return () => this.listeners.delete(listener); }
  public toggle(name: FaultName): void { if (!this.enabled) return; this.state = { ...this.state, [name]: !this.state[name] }; this.notify(); }
  public consume(name: FaultName): boolean { if (!this.enabled || !this.state[name]) return false; this.state = { ...this.state, [name]: false }; this.notify(); return true; }
  public set(name: FaultName, enabled: boolean): void { if (!this.enabled) return; this.state = { ...this.state, [name]: enabled }; this.notify(); }
  public dispatchContextLoss(canvas: Pick<HTMLCanvasElement, "dispatchEvent">): void { if (this.consume("loseWebGLContext")) canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })); }
  private notify(): void { for (const listener of this.listeners) listener(this.getState()); }
}

