export interface SnapConfig {
  detectRadius: number;
  enterRadius: number;
  exitRadius: number;
  strongLockRadius: number;
  positionEpsilon: number;
  angleEpsilon: number;
  previousCandidateBonus: number;
  connectionCountWeight: number;
  distanceWeight: number;
  rotationWeight: number;
  pointerWeight: number;
  dedupPositionQuantum: number;
}

export const DEFAULT_SNAP_CONFIG: SnapConfig = {
  detectRadius: 0.55,
  enterRadius: 0.3,
  exitRadius: 0.42,
  strongLockRadius: 0.18,
  positionEpsilon: 0.03,
  angleEpsilon: (2 * Math.PI) / 180,
  previousCandidateBonus: 1.5,
  connectionCountWeight: 10,
  distanceWeight: 2,
  rotationWeight: 1,
  pointerWeight: 0.5,
  dedupPositionQuantum: 0.001
};

export const validateSnapConfig = (config: SnapConfig): void => {
  if (!(config.enterRadius < config.exitRadius)) {
    throw new Error("SnapConfig requires enterRadius < exitRadius");
  }
  if (config.detectRadius < config.exitRadius) {
    throw new Error("SnapConfig detectRadius must be at least exitRadius");
  }
};
