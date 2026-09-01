import type { Quat } from "./quat.js";
import { angleBetween, angleBetweenVectors, normalize, rotateVector, yRotationQuarter } from "./quat.js";
import type { Transform } from "./transform.js";
import { cloneTransform } from "./transform.js";
import { vec3 } from "./vec3.js";

export const QUARTER_TURN_EPSILON = 1e-5;

export const normalizeAngle = (angle: number): number => {
  const fullTurn = Math.PI * 2;
  const normalized = ((angle % fullTurn) + fullTurn) % fullTurn;
  return normalized > Math.PI ? normalized - fullTurn : normalized;
};

export const nearestQuarterTurns = (rotation: Quat): number => {
  const normalized = normalize(rotation);
  const angle = 2 * Math.atan2(normalized.y, normalized.w);
  return Math.round(normalizeAngle(angle) / (Math.PI / 2));
};

export const quantizeYRotation = (rotation: Quat): Quat => yRotationQuarter(nearestQuarterTurns(rotation));

export const isQuarterYRotation = (rotation: Quat, epsilon = QUARTER_TURN_EPSILON): boolean =>
  angleBetween(rotation, quantizeYRotation(rotation)) <= epsilon;

const CARDINAL_DIRECTIONS = [
  vec3(1, 0, 0),
  vec3(-1, 0, 0),
  vec3(0, 1, 0),
  vec3(0, -1, 0),
  vec3(0, 0, 1),
  vec3(0, 0, -1)
];

export const isQuarterAxisRotation = (rotation: Quat, epsilon = QUARTER_TURN_EPSILON): boolean => {
  const normalized = normalize(rotation);
  return [vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)].every((axis) => {
    const rotated = rotateVector(normalized, axis);
    return CARDINAL_DIRECTIONS.some((direction) => angleBetweenVectors(rotated, direction) <= epsilon);
  });
};

export const quantizeTransform = (transform: Transform, positionQuantum = 0.001): Transform => {
  const result = cloneTransform(transform);
  result.position.x = Math.round(result.position.x / positionQuantum) * positionQuantum;
  result.position.y = Math.round(result.position.y / positionQuantum) * positionQuantum;
  result.position.z = Math.round(result.position.z / positionQuantum) * positionQuantum;
  result.rotation = quantizeYRotation(result.rotation);
  return result;
};

export const transformKey = (transform: Transform, positionQuantum = 0.001): string => {
  const quantized = quantizeTransform(transform, positionQuantum);
  const values = [quantized.position.x, quantized.position.y, quantized.position.z].map((value) => value.toFixed(6));
  const rotation = quantized.rotation;
  return `${values.join(",")}:${rotation.x.toFixed(6)},${rotation.y.toFixed(6)},${rotation.z.toFixed(6)},${rotation.w.toFixed(6)}`;
};
