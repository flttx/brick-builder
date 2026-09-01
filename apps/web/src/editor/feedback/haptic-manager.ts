export type HapticEvent = "snap" | "detach" | "bucket";

export class HapticManager {
  private enabled: boolean;

  public constructor(enabled = true) { this.enabled = enabled; }
  public setEnabled(enabled: boolean): void { this.enabled = enabled; }
  public trigger(event: HapticEvent): void {
    if (!this.enabled || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    navigator.vibrate(event === "snap" ? [8] : event === "detach" ? [12, 8, 12] : [16, 12, 16]);
  }
}

