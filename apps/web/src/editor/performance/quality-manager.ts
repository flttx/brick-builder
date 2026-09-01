export type QualityLevel = "high" | "balanced" | "low";

export interface QualitySettings {
  level: QualityLevel;
  dpr: number;
  shadows: boolean;
  postProcessing: boolean;
}

const SETTINGS: Record<QualityLevel, QualitySettings> = {
  high: { level: "high", dpr: 1.5, shadows: true, postProcessing: true },
  balanced: { level: "balanced", dpr: 1.25, shadows: true, postProcessing: false },
  low: { level: "low", dpr: 1, shadows: false, postProcessing: false }
};

export const qualitySettings = (level: QualityLevel): QualitySettings => ({ ...SETTINGS[level] });

export const guessInitialQuality = (environment: { hardwareConcurrency?: number; deviceMemory?: number; maxTouchPoints?: number } = {}): QualitySettings => {
  const mobile = (environment.maxTouchPoints ?? 0) > 0;
  const constrained = (environment.hardwareConcurrency ?? 8) <= 4 || (environment.deviceMemory ?? 8) <= 4;
  return qualitySettings(mobile || constrained ? "balanced" : "high");
};

export class QualityManager {
  private current: QualitySettings;
  private lowSeconds = 0;
  private highSeconds = 0;
  private cooldownSeconds = 0;

  public constructor(initial = guessInitialQuality()) { this.current = initial; }

  public getSettings(): QualitySettings { return { ...this.current }; }

  public update(fps: number, elapsedSeconds: number): QualitySettings | null {
    this.cooldownSeconds = Math.max(0, this.cooldownSeconds - elapsedSeconds);
    this.lowSeconds = fps < 40 ? this.lowSeconds + elapsedSeconds : 0;
    this.highSeconds = fps > 55 ? this.highSeconds + elapsedSeconds : 0;
    if (this.cooldownSeconds > 0) return null;
    if (this.lowSeconds >= 2) return this.changeLevel(-1);
    if (this.highSeconds >= 3) return this.changeLevel(1);
    return null;
  }

  private changeLevel(direction: -1 | 1): QualitySettings | null {
    const levels: QualityLevel[] = ["low", "balanced", "high"];
    const currentIndex = levels.indexOf(this.current.level);
    const next = levels[currentIndex + direction];
    this.lowSeconds = 0;
    this.highSeconds = 0;
    this.cooldownSeconds = 5;
    if (next === undefined) return null;
    this.current = qualitySettings(next);
    return this.getSettings();
  }
}

