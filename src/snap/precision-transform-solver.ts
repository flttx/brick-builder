import { angleBetweenVectors, normalize as normalizeQuat, quat, rotateVector } from "../math/quat.js";
import type { Quat } from "../math/quat.js";
import type { Transform } from "../math/transform.js";
import { transformPoint } from "../math/transform.js";
import type { ConnectorDefinition, WorldConnector } from "../connectors/connector.js";
import type { Vec3 } from "../math/vec3.js";
import { cross, dot, negate, normalize, scale, subtract } from "../math/vec3.js";

export interface PrecisionTransformInput {
  movingA1: ConnectorDefinition;
  movingA2: ConnectorDefinition;
  targetB1: WorldConnector;
  targetB2: WorldConnector;
}

export const solvePrecisionTransform = (input: PrecisionTransformInput): Transform | null => {
  const sourceAxis = planarDirection(subtract(input.movingA2.position, input.movingA1.position), input.movingA1.normal);
  const targetAxis = planarDirection(subtract(input.targetB2.worldPosition, input.targetB1.worldPosition), input.targetB1.worldNormal);
  if (sourceAxis === null || targetAxis === null) return null;

  const sourceNormal = normalize(input.movingA1.normal);
  const targetNormal = normalize(negate(input.targetB1.worldNormal));
  const sourceBinormal = normalize(cross(sourceNormal, sourceAxis));
  const targetBinormal = normalize(cross(targetNormal, targetAxis));
  const rotation = normalizeQuat(quatFromBasis(sourceAxis, sourceBinormal, sourceNormal, targetAxis, targetBinormal, targetNormal));
  const sourceNormalAfter = rotateVector(rotation, sourceNormal);
  const sourceAxisAfter = rotateVector(rotation, sourceAxis);
  if (angleBetweenVectors(sourceNormalAfter, targetNormal) > 1e-4 || angleBetweenVectors(sourceAxisAfter, targetAxis) > 1e-4) return null;
  return {
    position: subtract(input.targetB1.worldPosition, rotateVector(rotation, input.movingA1.position)),
    rotation
  };
};

export const precisionTransformError = (transform: Transform, input: PrecisionTransformInput): number => {
  const a1 = transformPoint(transform, input.movingA1.position);
  const a2 = transformPoint(transform, input.movingA2.position);
  return Math.max(
    distanceBetween(a1, input.targetB1.worldPosition),
    distanceBetween(a2, input.targetB2.worldPosition),
    angleBetweenVectors(transformDirection(transform.rotation, input.movingA1.normal), negate(input.targetB1.worldNormal))
  );
};

const planarDirection = (direction: Vec3, normal: Vec3): Vec3 | null => {
  const projected = subtract(direction, scale(normalize(normal), dot(direction, normalize(normal))));
  const magnitude = Math.hypot(projected.x, projected.y, projected.z);
  return magnitude < 1e-6 ? null : normalize(projected);
};

const quatFromBasis = (sourceX: Vec3, sourceY: Vec3, sourceZ: Vec3, targetX: Vec3, targetY: Vec3, targetZ: Vec3): Quat => {
  const matrix = {
    m00: targetX.x * sourceX.x + targetY.x * sourceY.x + targetZ.x * sourceZ.x,
    m01: targetX.x * sourceX.y + targetY.x * sourceY.y + targetZ.x * sourceZ.y,
    m02: targetX.x * sourceX.z + targetY.x * sourceY.z + targetZ.x * sourceZ.z,
    m10: targetX.y * sourceX.x + targetY.y * sourceY.x + targetZ.y * sourceZ.x,
    m11: targetX.y * sourceX.y + targetY.y * sourceY.y + targetZ.y * sourceZ.y,
    m12: targetX.y * sourceX.z + targetY.y * sourceY.z + targetZ.y * sourceZ.z,
    m20: targetX.z * sourceX.x + targetY.z * sourceY.x + targetZ.z * sourceZ.x,
    m21: targetX.z * sourceX.y + targetY.z * sourceY.y + targetZ.z * sourceZ.y,
    m22: targetX.z * sourceX.z + targetY.z * sourceY.z + targetZ.z * sourceZ.z
  };
  const trace = matrix.m00 + matrix.m11 + matrix.m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return quat((matrix.m21 - matrix.m12) / s, (matrix.m02 - matrix.m20) / s, (matrix.m10 - matrix.m01) / s, 0.25 * s);
  }
  if (matrix.m00 > matrix.m11 && matrix.m00 > matrix.m22) {
    const s = Math.sqrt(1 + matrix.m00 - matrix.m11 - matrix.m22) * 2;
    return quat(0.25 * s, (matrix.m01 + matrix.m10) / s, (matrix.m02 + matrix.m20) / s, (matrix.m21 - matrix.m12) / s);
  }
  if (matrix.m11 > matrix.m22) {
    const s = Math.sqrt(1 + matrix.m11 - matrix.m00 - matrix.m22) * 2;
    return quat((matrix.m01 + matrix.m10) / s, 0.25 * s, (matrix.m12 + matrix.m21) / s, (matrix.m02 - matrix.m20) / s);
  }
  const s = Math.sqrt(1 + matrix.m22 - matrix.m00 - matrix.m11) * 2;
  return quat((matrix.m02 + matrix.m20) / s, (matrix.m12 + matrix.m21) / s, 0.25 * s, (matrix.m10 - matrix.m01) / s);
};

const transformDirection = (rotation: Quat, direction: Vec3): Vec3 => rotateVector(rotation, direction);
const distanceBetween = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
