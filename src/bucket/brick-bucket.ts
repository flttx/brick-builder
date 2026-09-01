import type { PartDefinition } from "../parts/part-definition.js";

export interface BrickBucketPool {
  id: string;
  name: string;
  allowedPartIds?: string[];
  allowedCategories?: PartDefinition["category"][];
  excludedPartIds?: string[];
  weights?: Record<string, number>;
  allowedColorIds?: string[];
  seedMode: "random" | "seeded";
}

export interface BrickBucketDraw {
  partId: string;
  colorId: string;
  seed: number;
  drawIndex: number;
}

export const BASIC_BRICK_BUCKET: BrickBucketPool = {
  id: "basic",
  name: "Basic bucket",
  allowedCategories: ["brick", "plate", "tile"],
  weights: { brick: 6, plate: 3, tile: 1 },
  seedMode: "random"
};

export class BrickBucket {
  private drawIndex = 0;

  public constructor(private readonly parts: PartDefinition[], private readonly pool: BrickBucketPool = BASIC_BRICK_BUCKET, private readonly seed = randomSeed()) {}

  public draw(currentColorId: string): BrickBucketDraw {
    const candidates = this.parts.filter((part) => isAllowedPart(part, this.pool));
    if (candidates.length === 0) {
      throw new Error(`Bucket ${this.pool.id} has no eligible parts`);
    }
    const index = this.pool.seedMode === "seeded"
      ? seededIndex(this.seed, this.drawIndex, candidates, this.pool.weights)
      : weightedIndex(Math.random(), candidates, this.pool.weights);
    const colorId = this.pool.allowedColorIds === undefined
      ? currentColorId
      : this.pool.allowedColorIds.includes(currentColorId) ? currentColorId : this.pool.allowedColorIds[0] ?? currentColorId;
    const part = candidates[index];
    if (part === undefined) {
      throw new Error(`Bucket ${this.pool.id} selected an invalid part`);
    }
    const draw = { partId: part.id, colorId, seed: this.seed, drawIndex: this.drawIndex };
    this.drawIndex += 1;
    return draw;
  }

  public getDrawIndex(): number {
    return this.drawIndex;
  }
}

const isAllowedPart = (part: PartDefinition, pool: BrickBucketPool): boolean =>
  (pool.allowedPartIds === undefined || pool.allowedPartIds.includes(part.id)) &&
  (pool.allowedCategories === undefined || pool.allowedCategories.includes(part.category)) &&
  !(pool.excludedPartIds ?? []).includes(part.id) && (pool.weights?.[part.id] ?? pool.weights?.[part.category] ?? 1) > 0;

const weightFor = (part: PartDefinition, weights: Record<string, number> | undefined): number => Math.max(0, weights?.[part.id] ?? weights?.[part.category] ?? 1);

const weightedIndex = (sample: number, candidates: PartDefinition[], weights: Record<string, number> | undefined): number => {
  const total = candidates.reduce((sum, part) => sum + weightFor(part, weights), 0);
  let cursor = sample * total;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate === undefined) {
      break;
    }
    cursor -= weightFor(candidate, weights);
    if (cursor < 0) {
      return index;
    }
  }
  return candidates.length - 1;
};

const seededIndex = (seed: number, drawIndex: number, candidates: PartDefinition[], weights: Record<string, number> | undefined): number => weightedIndex(randomUnit(seed, drawIndex), candidates, weights);

const randomUnit = (seed: number, index: number): number => {
  let value = (seed ^ Math.imul(index + 1, 0x45d9f3b)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0x45d9f3b) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
};

const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;
