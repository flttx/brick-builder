import { performance } from "node:perf_hooks";
import * as THREE from "three";
import { BrickEngine } from "../src/index.js";
import { identity } from "../src/math/quat.js";
import { ThreeBrickRenderer } from "../apps/web/src/editor/renderer/brick-renderer.js";

const sizes = [100, 500, 1000, 3000, 5000];
const parts = ["brick-2x4", "brick-1x2", "plate-2x4", "plate-1x4", "tile-2x2"];

for (const layout of ["sparse", "dense"] as const) for (const size of sizes) {
  const engine = new BrickEngine();
  for (let index = 0; index < size; index += 1) {
    const partId = parts[index % parts.length] ?? "brick-2x4";
    const spacing = layout === "dense" ? 1.7 : 4.8;
    engine.createBrick({ id: `bench-${index}`, partId, colorId: index % 2 === 0 ? "blue" : "red", transform: { position: { x: (index % 40) * spacing - 30, y: Math.floor(index / 160) * 1.4, z: Math.floor(index / 40) * spacing - 48 }, rotation: identity() } });
  }
  const parent = new THREE.Group();
  const renderer = new ThreeBrickRenderer(parent, engine, 256);
  const sync = measure(() => renderer.syncFromEngine());
  const batchCount = renderer.batches.size;
  const chunkCount = renderer.getChunkCount();
  const instanced = renderer.getPickableObjects().every((object) => object instanceof THREE.InstancedMesh);
  process.stdout.write(`${JSON.stringify({ size, layout, sync, batches: batchCount, chunks: chunkCount, drawCalls: chunkCount, instances: renderer.getInstanceCount(), instanced, note: "CPU sync proxy; no WebGL context in Node" })}\n`);
  renderer.dispose();
}

function measure(operation: () => void): { p50: number; p95: number; p99: number } {
  for (let index = 0; index < 10; index += 1) operation();
  const samples: number[] = [];
  for (let index = 0; index < 50; index += 1) { const start = performance.now(); operation(); samples.push(performance.now() - start); }
  samples.sort((left, right) => left - right);
  return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), p99: percentile(samples, 0.99) };
}

function percentile(values: number[], ratio: number): number { return values[Math.min(values.length - 1, Math.floor(values.length * ratio))] ?? 0; }

