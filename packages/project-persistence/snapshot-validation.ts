import type { BrickProjectSnapshot } from "../../src/serialization/project-snapshot.js";

export interface SnapshotValidationOptions {
  maxBytes?: number;
  maxBricks?: number;
}

export interface SnapshotValidationResult {
  valid: boolean;
  errors: string[];
  bytes: number;
}

export const validateProjectSnapshot = (input: unknown, options: SnapshotValidationOptions = {}): SnapshotValidationResult => {
  const errors: string[] = [];
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const maxBricks = options.maxBricks ?? 10_000;
  const bytes = byteLength(input);
  if (bytes > maxBytes) errors.push("snapshot_too_large");
  if (!isRecord(input) || input.version !== 1 || !Array.isArray(input.bricks) || !Array.isArray(input.connections)) return { valid: false, errors: [...errors, "invalid_snapshot"], bytes };
  if (input.bricks.length > maxBricks) errors.push("brick_count_limit");
  const brickIds = new Set<string>();
  for (const brick of input.bricks) {
    if (!isRecord(brick) || typeof brick.id !== "string" || brick.id.length === 0 || brick.id.length > 120 || typeof brick.partId !== "string" || typeof brick.colorId !== "string" || !isTuple(brick.position, 3) || !isTuple(brick.rotation, 4)) {
      errors.push("invalid_brick");
      continue;
    }
    if (brickIds.has(brick.id)) errors.push("duplicate_brick_id");
    brickIds.add(brick.id);
  }
  const connectionIds = new Set<string>();
  for (const connection of input.connections) {
    if (!isRecord(connection) || typeof connection.id !== "string" || typeof connection.brickA !== "string" || typeof connection.brickB !== "string" || !Array.isArray(connection.pairs) || !brickIds.has(connection.brickA) || !brickIds.has(connection.brickB)) {
      errors.push("invalid_connection");
      continue;
    }
    if (connectionIds.has(connection.id)) errors.push("duplicate_connection_id");
    connectionIds.add(connection.id);
    for (const pair of connection.pairs) if (!isStringTuple(pair, 2)) errors.push("invalid_connection_pair");
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], bytes };
};

export const isProjectSnapshot = (input: unknown): input is BrickProjectSnapshot => validateProjectSnapshot(input).valid;
const byteLength = (input: unknown): number => { try { return new TextEncoder().encode(JSON.stringify(input)).byteLength; } catch { return Number.POSITIVE_INFINITY; } };
interface UnknownRecord { [key: string]: unknown }
const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null;
const isTuple = (value: unknown, length: number): value is number[] => Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
const isStringTuple = (value: unknown, length: number): value is string[] => Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === "string" && entry.length > 0);

