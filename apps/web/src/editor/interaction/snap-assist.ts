import { solveSnapTransform } from "../../../../../src/index.js";
import type { BrickEngine, ConnectorDefinition, Transform, Vec3, WorldConnector } from "../../../../../src/index.js";
import { distance } from "../../../../../src/math/vec3.js";

export interface SnapAssistResult {
  transform: Transform;
  pointerWorld: Vec3;
}

export const findSnapAssist = (
  engine: BrickEngine,
  movingBrickId: string,
  targetBrickId: string,
  pointerWorld: Vec3,
  freeTransform: Transform
): SnapAssistResult | undefined => {
  if (movingBrickId === targetBrickId) {
    return undefined;
  }
  const movingBrick = engine.bricks.get(movingBrickId);
  const targetBrick = engine.bricks.get(targetBrickId);
  const movingPart = engine.parts.get(movingBrick.partId);
  const targetPart = engine.parts.get(targetBrick.partId);
  const targetConnectors = engine.connectors.getWorldConnectors(targetBrick, targetPart);
  const candidates: Array<{ transform: Transform; target: WorldConnector; pointerDistance: number }> = [];

  for (const target of targetConnectors) {
    if (!engine.occupancy.canOccupy(target, "pending")) {
      continue;
    }
    for (const moving of movingPart.connectors) {
      if (engine.occupancy.isOccupied(movingBrickId, moving.id)) {
        continue;
      }
      const rule = engine.connectors.compatibility.getRule(moving.type, target.type);
      if (rule === undefined || !rule.allow || !sameCompatibilityGroup(moving, target)) {
        continue;
      }
      const transform = solveSnapTransform({
        movingConnector: moving,
        targetConnector: target,
        currentRotation: freeTransform.rotation,
        compatibility: rule,
        rotationEpsilon: engine.snap.config.angleEpsilon
      });
      if (transform !== null) {
        candidates.push({ transform, target, pointerDistance: distance(pointerWorld, target.worldPosition) });
      }
    }
  }

  const best = candidates.sort((a, b) => a.pointerDistance - b.pointerDistance)[0];
  return best === undefined
    ? undefined
    : { transform: best.transform, pointerWorld: { ...best.target.worldPosition } };
};

const sameCompatibilityGroup = (a: ConnectorDefinition, b: ConnectorDefinition): boolean =>
  a.compatibilityGroup === b.compatibilityGroup || a.compatibilityGroup === "*" || b.compatibilityGroup === "*";
