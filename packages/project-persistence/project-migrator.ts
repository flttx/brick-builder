import type { BrickProjectSnapshot } from "../../src/serialization/project-snapshot.js";
import type { ProjectFile, ProjectRecoveryReport } from "./project-types.js";

interface UnknownRecord {
  [key: string]: unknown;
}

export interface ProjectMigrationResult {
  snapshot: BrickProjectSnapshot;
  report: ProjectRecoveryReport;
}

export const migrateProjectSnapshot = (input: unknown): ProjectMigrationResult => {
  const report: ProjectRecoveryReport = { skippedBrickIds: [], skippedConnectionIds: [], warnings: [] };
  if (!isRecord(input) || input.version !== 1 || !Array.isArray(input.bricks) || !Array.isArray(input.connections)) {
    throw new Error("Unsupported or malformed project snapshot");
  }

  const bricks: BrickProjectSnapshot["bricks"] = [];
  const brickIds = new Set<string>();
  for (const candidate of input.bricks) {
    if (!isSnapshotBrick(candidate) || brickIds.has(candidate.id)) {
      const id = isRecord(candidate) && typeof candidate.id === "string" ? candidate.id : "unknown";
      report.skippedBrickIds.push(id);
      continue;
    }
    brickIds.add(candidate.id);
    bricks.push({
      id: candidate.id,
      partId: candidate.partId,
      colorId: candidate.colorId,
      position: [...candidate.position] as [number, number, number],
      rotation: [...candidate.rotation] as [number, number, number, number]
    });
  }

  const connections: BrickProjectSnapshot["connections"] = [];
  const connectionIds = new Set<string>();
  for (const candidate of input.connections) {
    if (!isSnapshotConnection(candidate) || connectionIds.has(candidate.id) || !brickIds.has(candidate.brickA) || !brickIds.has(candidate.brickB)) {
      const id = isRecord(candidate) && typeof candidate.id === "string" ? candidate.id : "unknown";
      report.skippedConnectionIds.push(id);
      continue;
    }
    const pairs = candidate.pairs.filter((pair): pair is [string, string] => Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && typeof pair[1] === "string");
    if (pairs.length === 0) {
      report.skippedConnectionIds.push(candidate.id);
      continue;
    }
    connectionIds.add(candidate.id);
    connections.push({ id: candidate.id, brickA: candidate.brickA, brickB: candidate.brickB, pairs });
  }
  if (report.skippedBrickIds.length > 0 || report.skippedConnectionIds.length > 0) {
    report.warnings.push("部分损坏数据已跳过，保留了可恢复的积木和连接。");
  }
  return { snapshot: { version: 1, bricks, connections }, report };
};

export const migrateProjectFile = (input: unknown): { file: ProjectFile; report: ProjectRecoveryReport } => {
  if (!isRecord(input) || input.format !== "brick-project" || typeof input.formatVersion !== "number" || !isRecord(input.project) || typeof input.project.id !== "string" || typeof input.project.name !== "string" || typeof input.savedAt !== "string") {
    throw new Error("Malformed project file");
  }
  const migrated = migrateProjectSnapshot(input.snapshot);
  const file: ProjectFile = {
    format: "brick-project",
    formatVersion: input.formatVersion,
    project: { id: input.project.id, name: input.project.name },
    snapshot: migrated.snapshot,
    savedAt: input.savedAt,
    ...(typeof input.appVersion === "string" ? { appVersion: input.appVersion } : {}),
    ...(typeof input.assetPackVersion === "string" ? { assetPackVersion: input.assetPackVersion } : {})
  };
  return { file, report: migrated.report };
};

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNumberTuple = (value: unknown, length: number): value is number[] => Array.isArray(value) && value.length === length && value.every(isFiniteNumber);
const isSnapshotBrick = (value: unknown): value is { id: string; partId: string; colorId: string; position: number[]; rotation: number[] } => isRecord(value) && typeof value.id === "string" && value.id.length > 0 && typeof value.partId === "string" && typeof value.colorId === "string" && isNumberTuple(value.position, 3) && isNumberTuple(value.rotation, 4);
const isSnapshotConnection = (value: unknown): value is { id: string; brickA: string; brickB: string; pairs: unknown[] } => isRecord(value) && typeof value.id === "string" && typeof value.brickA === "string" && typeof value.brickB === "string" && Array.isArray(value.pairs);

