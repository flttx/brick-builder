import type { AudioManager, BrickSoundId } from "./audio-manager.js";
import type { HapticManager, HapticEvent } from "./haptic-manager.js";

export class FeedbackOrchestrator {
  public constructor(private readonly audio: Pick<AudioManager, "play" | "resumeFromUserGesture">, private readonly haptic: Pick<HapticManager, "trigger">) {}

  public async userGesture(): Promise<void> { await this.audio.resumeFromUserGesture(); }
  public async afterUserGesture(action: () => void): Promise<void> { await this.userGesture(); action(); }
  public placement(snapped: boolean): void { this.emit(snapped ? "snap_medium" : "drop", snapped ? "snap" : undefined); }
  public detach(): void { this.emit("detach", "detach"); }
  public bucket(): void { this.emit("bucket_shake", "bucket"); }
  public delete(): void { this.emit("delete", undefined); }
  public undo(): void { this.emit("detach", "detach"); }
  public redo(): void { this.emit("drop", undefined); }

  private emit(sound: BrickSoundId, haptic: HapticEvent | undefined): void { this.audio.play(sound); if (haptic !== undefined) this.haptic.trigger(haptic); }
}
