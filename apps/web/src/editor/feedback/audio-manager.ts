export type BrickSoundId = "snap_soft" | "snap_medium" | "snap_strong" | "detach" | "bucket_shake" | "bucket_rattle" | "drop" | "delete" | "brick_rattle" | "brick_pick" | "brick_drop";

export interface AudioManagerOptions {
  volume?: number;
  enabled?: boolean;
  random?: () => number;
}

export class AudioManager {
  private context: AudioContext | undefined;
  private enabled: boolean;
  private volume: number;
  private readonly random: () => number;

  public constructor(options: AudioManagerOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.volume = options.volume ?? 0.45;
    this.random = options.random ?? Math.random;
  }

  public setEnabled(enabled: boolean): void { this.enabled = enabled; }
  public setVolume(volume: number): void { this.volume = Math.min(1, Math.max(0, volume)); }
  public async resumeFromUserGesture(): Promise<void> {
    if (!this.enabled || typeof window === "undefined" || typeof window.AudioContext === "undefined") return;
    this.context ??= new window.AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
  }

  public play(sound: BrickSoundId): void {
    if (!this.enabled || this.context === undefined || this.context.state === "closed") return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const pitch = 1 + (this.random() * 0.06 - 0.03);
    const volume = this.volume * (1 + (this.random() * 0.1 - 0.05));
    oscillator.type = sound === "delete" || sound === "detach" ? "sawtooth" : "sine";
    oscillator.frequency.setValueAtTime(soundFrequency(sound) * pitch, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.18), now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + soundDuration(sound));
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + soundDuration(sound) + 0.02);
  }

  public dispose(): void { void this.context?.close(); this.context = undefined; }
}

const soundFrequency = (sound: BrickSoundId): number => sound === "snap_strong" ? 520 : sound === "snap_medium" ? 420 : sound === "snap_soft" ? 350 : sound.includes("bucket") || sound === "brick_rattle" ? 180 : 260;
const soundDuration = (sound: BrickSoundId): number => sound.includes("bucket") || sound === "brick_rattle" ? 0.16 : 0.09;

