import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

interface FrameSample { frameMs: number; fps: number; }
interface BrowserBenchmarkResult {
  size: number;
  layout: "sparse" | "dense";
  warmupSeconds: number;
  sampleSeconds: number;
  fps: Percentiles & { p05: number };
  frameMs: Percentiles;
  drawCalls: number;
  batchCount: number;
  chunkCount: number;
  instances: number;
  visibleInstances: number;
  triangles: number;
  dpr: number;
  quality: string;
  glbLoadCount: number;
  memoryUsedBytes?: number;
}
interface BrowserSceneSample {
  samples: FrameSample[];
  metrics: { drawCalls: number; batchCount: number; chunkCount: number; instances: number; visibleInstances: number; triangles: number; dpr: number; quality: string };
  browser: { userAgent: string; hardwareConcurrency: number; deviceMemory?: number; memoryUsedBytes?: number; glbLoadCount: number; assetPackVersion: string };
}
interface Percentiles { p50: number; p95: number; p99: number; }
const DESKTOP_1000_P50_TARGET_FPS = 45;
const performanceEnvironmentVerified = process.env.BROWSER_BENCHMARK_ENVIRONMENT_VERIFIED === "true";

test("records fixed browser renderer performance scenarios", async ({ page, browserName }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const results: BrowserBenchmarkResult[] = [];
  let assetPackVersion = "legacy-asset-pack";
  const sizes = process.env.BROWSER_BENCHMARK_SMOKE === "true" ? [1000] : [100, 500, 1000, 3000, 5000];
  const layouts = process.env.BROWSER_BENCHMARK_SMOKE === "true" ? ["sparse"] as const : ["sparse", "dense"] as const;
  for (const size of sizes) {
    for (const layout of layouts) {
      await page.goto(`/benchmark?bench=${size}&layout=${layout}&quality=balanced`, { waitUntil: "networkidle" });
      const scene = page.locator('main[data-benchmark-ready="true"]');
      await expect(scene).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("canvas")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(3_000);
      const sceneSample = await page.evaluate((sampleSeconds) => new Promise<BrowserSceneSample>((resolve) => {
        const values: FrameSample[] = [];
        let previous = performance.now();
        const started = previous;
        const readScene = (): BrowserSceneSample["metrics"] => { const element = document.querySelector<HTMLElement>('main[data-benchmark-ready="true"]'); return { drawCalls: Number(element?.getAttribute("data-benchmark-draw-calls") ?? 0), instances: Number(element?.getAttribute("data-benchmark-instances") ?? 0), visibleInstances: Number(element?.getAttribute("data-benchmark-visible-instances") ?? 0), triangles: Number(element?.getAttribute("data-benchmark-triangles") ?? 0), batchCount: Number(element?.getAttribute("data-benchmark-batches") ?? 0), chunkCount: Number(element?.getAttribute("data-benchmark-chunks") ?? 0), dpr: Number(element?.getAttribute("data-benchmark-dpr") ?? 0), quality: element?.getAttribute("data-benchmark-quality") ?? "unknown" }; };
        const sample = (now: number): void => { const frameMs = now - previous; previous = now; if (now - started >= sampleSeconds * 1000) { const current = readScene(); void fetch("/assets/current.json").then(async (response) => { const value = response.ok ? await response.json() as unknown : undefined; const assetPackVersion = typeof value === "object" && value !== null && "assetPackVersion" in value && typeof value.assetPackVersion === "string" ? value.assetPackVersion : "legacy-asset-pack"; resolve({ samples: values, metrics: current, browser: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory, memoryUsedBytes: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize, glbLoadCount: performance.getEntriesByType("resource").filter((entry) => entry.name.endsWith(".glb")).length, assetPackVersion } }); }).catch(() => resolve({ samples: values, metrics: current, browser: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, glbLoadCount: 0, assetPackVersion: "legacy-asset-pack" } })); return; } if (frameMs > 0) values.push({ frameMs, fps: 1000 / frameMs }); requestAnimationFrame(sample); };
        requestAnimationFrame(sample);
      }), 10);
      const samples = sceneSample.samples;
      const metrics = sceneSample.metrics;
      const browserData = sceneSample.browser;
      assetPackVersion = browserData.assetPackVersion;
      results.push({ size, layout, warmupSeconds: 3, sampleSeconds: 10, fps: { ...percentiles(samples.map((sample) => sample.fps)), p05: percentile(samples.map((sample) => sample.fps), 0.05) }, frameMs: percentiles(samples.map((sample) => sample.frameMs)), ...metrics, dpr: metrics.dpr, quality: metrics.quality, glbLoadCount: browserData.glbLoadCount, ...(browserData.memoryUsedBytes === undefined ? {} : { memoryUsedBytes: browserData.memoryUsedBytes }) });
      expect(metrics.instances).toBe(size);
      expect(metrics.visibleInstances).toBeGreaterThanOrEqual(0);
      expect(metrics.visibleInstances).toBeLessThanOrEqual(metrics.instances);
      expect(samples.length).toBeGreaterThan(5);
    }
  }
  if (performanceEnvironmentVerified) {
    const desktop1000 = results.filter((result) => result.size === 1000);
    expect(desktop1000.length).toBeGreaterThan(0);
    for (const result of desktop1000) {
      expect(result.fps.p50, `${result.layout} 1000 Brick P50 FPS`).toBeGreaterThanOrEqual(DESKTOP_1000_P50_TARGET_FPS);
    }
  }
  const metadata = await page.evaluate(() => ({ userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory, viewport: { width: window.innerWidth, height: window.innerHeight } }));
  const report = { generatedAt: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? null, appVersion: "0.1.0", assetPackVersion, browser: browserName, os: process.platform, viewport: metadata.viewport, hardware: { userAgent: metadata.userAgent, hardwareConcurrency: metadata.hardwareConcurrency, ...(metadata.deviceMemory === undefined ? {} : { deviceMemory: metadata.deviceMemory }) }, performanceVerification: { status: performanceEnvironmentVerified ? "verified" : "not-environment-verified", desktop1000P50TargetFps: DESKTOP_1000_P50_TARGET_FPS }, metrics: results };
  await writeFile("performance-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile("performance-report.md", renderMarkdown(report), "utf8");
});

function percentiles(values: number[]): Percentiles { return { p50: percentile(values, 0.5), p95: percentile(values, 0.95), p99: percentile(values, 0.99) }; }
function percentile(values: number[], quantile: number): number { if (values.length === 0) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))] ?? 0; }
function renderMarkdown(report: { browser: string; os: string; performanceVerification: { status: string; desktop1000P50TargetFps: number }; metrics: BrowserBenchmarkResult[] }): string { return [`# Browser Performance Report`, ``, `- Browser: ${report.browser}`, `- OS: ${report.os}`, `- Renderer benchmark: real browser, fixed 1440×900 viewport, Balanced, 3s warmup + 10s samples`, `- Real-device status: not established by this headless/host run`, `- Performance target status: ${report.performanceVerification.status}`, `- Desktop 1000 Brick P50 target: ≥${report.performanceVerification.desktop1000P50TargetFps} FPS (only enforced when the benchmark environment is explicitly verified)`, ``, `| Size | Layout | FPS P50 | FPS P05 | Frame P95 | Draw Calls | Instances | Visible | DPR |`, `| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`, ...report.metrics.map((item) => `| ${item.size} | ${item.layout} | ${item.fps.p50.toFixed(2)} | ${item.fps.p05.toFixed(2)} | ${item.frameMs.p95.toFixed(2)} | ${item.drawCalls} | ${item.instances} | ${item.visibleInstances} | ${item.dpr.toFixed(2)} |`)].join("\n") + "\n"; }
