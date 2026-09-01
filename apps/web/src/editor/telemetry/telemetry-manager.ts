export type TelemetryEventName = "fatal" | "context_loss" | "asset_failure" | "cloud_save_failure" | "conflict" | "performance_summary";

export interface TelemetryEvent {
  name: TelemetryEventName;
  at: number;
  appVersion: string;
  assetPackVersion: string;
  sessionId: string;
  fields: Record<string, string | number | boolean>;
}

export interface TelemetryReporter {
  report(event: TelemetryEvent): Promise<void> | void;
}

export class NoopTelemetryReporter implements TelemetryReporter {
  public report(_event: TelemetryEvent): void { return undefined; }
}

export class HttpTelemetryReporter implements TelemetryReporter {
  public constructor(private readonly endpoint: string, private readonly fetchImpl: typeof fetch = fetch) {}

  public async report(event: TelemetryEvent): Promise<void> {
    try {
      await this.fetchImpl(this.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event), keepalive: true });
    } catch {
      return undefined;
    }
  }
}

export interface TelemetryOptions {
  enabled: boolean;
  consent: boolean;
  appVersion: string;
  assetPackVersion: string;
  reporter?: TelemetryReporter;
  storage?: Pick<Storage, "getItem" | "setItem">;
  sessionId?: string;
  now?: () => number;
}

export class TelemetryManager {
  private readonly reporter: TelemetryReporter;
  private readonly sessionId: string;
  private readonly now: () => number;
  private readonly enabled: boolean;
  private readonly appVersion: string;
  private readonly assetPackVersion: string;
  private readonly frameSamples: Array<{ fps: number; frameMs: number; drawCalls: number }> = [];

  public constructor(options: TelemetryOptions) {
    this.enabled = options.enabled && options.consent;
    this.reporter = options.reporter ?? new NoopTelemetryReporter();
    this.now = options.now ?? Date.now;
    this.appVersion = options.appVersion;
    this.assetPackVersion = options.assetPackVersion;
    const storageKey = "brick-builder-anonymous-session";
    let stored: string | null | undefined;
    try { stored = options.storage?.getItem(storageKey); } catch { stored = undefined; }
    this.sessionId = options.sessionId ?? stored ?? createAnonymousSessionId(this.now());
    if (stored === null || stored === undefined) { try { options.storage?.setItem(storageKey, this.sessionId); } catch { stored = undefined; } }
  }

  public record(name: TelemetryEventName, fields: Record<string, string | number | boolean> = {}): void {
    if (!this.enabled) return;
    const event: TelemetryEvent = { name, at: this.now(), appVersion: this.appVersion, assetPackVersion: this.assetPackVersion, sessionId: this.sessionId, fields: sanitizeFields(fields) };
    void Promise.resolve(this.reporter.report(event)).catch(() => undefined);
  }

  public recordFrame(fps: number, frameMs: number, drawCalls: number): void {
    if (this.frameSamples.length >= 240) this.frameSamples.shift();
    this.frameSamples.push({ fps, frameMs, drawCalls });
  }

  public flushPerformanceSummary(): void {
    if (this.frameSamples.length === 0) return;
    const fps = this.frameSamples.map((sample) => sample.fps);
    const frameMs = this.frameSamples.map((sample) => sample.frameMs);
    this.record("performance_summary", { samples: this.frameSamples.length, fpsP50: percentile(fps, 0.5), fpsP95: percentile(fps, 0.95), frameMsP50: percentile(frameMs, 0.5), drawCallsMax: Math.max(...this.frameSamples.map((sample) => sample.drawCalls)) });
    this.frameSamples.length = 0;
  }
}

const sanitizeFields = (fields: Record<string, string | number | boolean>): Record<string, string | number | boolean> => {
  const allowed = new Set(["reason", "status", "partId", "durationMs", "samples", "fpsP50", "fpsP95", "frameMsP50", "drawCallsMax", "count", "mode"]);
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => allowed.has(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")));
};

const percentile = (values: number[], ratio: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
};
const createAnonymousSessionId = (seed: number): string => `anon-${seed.toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
