import { performance } from "node:perf_hooks";
import { BrickEngine, toWorldCollider } from "../src/index.js";

type Layout = "sparse" | "dense";
interface Percentiles { p50: number; p95: number; p99: number; }

const random = (seed: number): (() => number) => { let state = seed >>> 0; return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x1_0000_0000; }; };
const measure = (operation: () => void): Percentiles => {
  for (let index = 0; index < 10; index += 1) operation();
  const samples: number[] = [];
  for (let index = 0; index < 50; index += 1) { const start = performance.now(); operation(); samples.push(performance.now() - start); }
  samples.sort((left, right) => left - right);
  return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), p99: percentile(samples, 0.99) };
};

const benchmarkSize = (size: number, layout: Layout): void => {
  const next = random(0x5eed + size + (layout === "dense" ? 1 : 0));
  const engine = new BrickEngine();
  engine.createBrick({ id: "base", partId: "brick-2x4", transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } });
  const movingId = engine.createBrick({ id: "moving", partId: "brick-2x4", transform: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } });
  for (let index = 0; index < size - 2; index += 1) {
    const spacing = layout === "dense" ? 1.7 : 6;
    engine.createBrick({ id: `fixture-${index}`, partId: "brick-1x1", transform: { position: { x: (index % 40) * spacing + next() * 0.01, y: Math.floor(index / 160) * 1.2, z: Math.floor(index / 40) * spacing }, rotation: { x: 0, y: 0, z: 0, w: 1 } } });
  }
  const values = engine.bricks.values();
  const rebuildIndexes = (): void => { engine.spatial.clear(); engine.brickSpatial.clear(); for (const brick of values) { const part = engine.parts.get(brick.partId); engine.spatial.insertMany(engine.connectors.getWorldConnectors(brick, part)); engine.brickSpatial.insertMany(part.colliders.map((collider) => toWorldCollider(brick, collider))); } };
  rebuildIndexes();
  const snapshot = engine.getSnapshot();
  const loadEngine = new BrickEngine();
  const result = { size, layout, index: measure(rebuildIndexes), snap: measure(() => { engine.snap.solve({ movingBrickId: movingId, freeTransform: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }, mode: "auto" }); }), collision: measure(() => { engine.collision.checkBrick(engine.bricks.get(movingId), { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }); }), serialize: measure(() => { engine.getSnapshot(); }), load: measure(() => { loadEngine.loadSnapshot(snapshot); }) };
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

const percentile = (values: number[], ratio: number): number => values[Math.min(values.length - 1, Math.floor(values.length * ratio))] ?? 0;
const sizes = [100, 500, 1000, 3000, 5000];
for (const layout of ["sparse", "dense"] as const) for (const size of sizes) benchmarkSize(size, layout);
