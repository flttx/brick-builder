import type { Vec3 } from "./vec3.js";
import { cross, dot, length as vec3Length, normalize as normalizeVec3, vec3 } from "./vec3.js";

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const quat = (x = 0, y = 0, z = 0, w = 1): Quat => ({ x, y, z, w });

export const identity = (): Quat => quat();

export const cloneQuat = (value: Quat): Quat => ({ ...value });

export const lengthSquared = (value: Quat): number =>
  value.x * value.x + value.y * value.y + value.z * value.z + value.w * value.w;

export const length = (value: Quat): number => Math.sqrt(lengthSquared(value));

export const normalize = (value: Quat): Quat => {
  const magnitude = length(value);
  if (magnitude === 0) {
    return identity();
  }
  return quat(value.x / magnitude, value.y / magnitude, value.z / magnitude, value.w / magnitude);
};

/** Hamilton product. The returned rotation applies b, then a. */
export const multiply = (a: Quat, b: Quat): Quat =>
  quat(
    a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  );

export const conjugate = (value: Quat): Quat => quat(-value.x, -value.y, -value.z, value.w);

export const inverse = (value: Quat): Quat => {
  const squared = lengthSquared(value);
  if (squared === 0) {
    return identity();
  }
  const result = conjugate(value);
  return quat(result.x / squared, result.y / squared, result.z / squared, result.w / squared);
};

export const fromAxisAngle = (axis: Vec3, angle: number): Quat => {
  const unitAxis = normalizeVec3(axis);
  const halfAngle = angle / 2;
  const sine = Math.sin(halfAngle);
  return normalize(quat(unitAxis.x * sine, unitAxis.y * sine, unitAxis.z * sine, Math.cos(halfAngle)));
};

export const yRotationQuarter = (quarterTurns: number): Quat =>
  fromAxisAngle(vec3(0, 1, 0), (Math.trunc(quarterTurns) * Math.PI) / 2);

export const rotateVector = (rotation: Quat, value: Vec3): Vec3 => {
  const unitRotation = normalize(rotation);
  const quaternionVector = quat(value.x, value.y, value.z, 0);
  const rotated = multiply(multiply(unitRotation, quaternionVector), inverse(unitRotation));
  return vec3(rotated.x, rotated.y, rotated.z);
};

export const angleBetween = (a: Quat, b: Quat): number => {
  const left = normalize(a);
  const right = normalize(b);
  const absoluteDot = Math.min(1, Math.abs(left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w));
  return 2 * Math.acos(absoluteDot);
};

export const angleBetweenVectors = (a: Vec3, b: Vec3): number => {
  const left = normalizeVec3(a);
  const right = normalizeVec3(b);
  const denominator = vec3Length(left) * vec3Length(right);
  if (denominator === 0) {
    return Math.PI;
  }
  return Math.acos(Math.max(-1, Math.min(1, dot(left, right) / denominator)));
};

export const alignVectorRotation = (from: Vec3, to: Vec3): Quat => {
  const source = normalizeVec3(from);
  const target = normalizeVec3(to);
  const sourceLength = vec3Length(source);
  const targetLength = vec3Length(target);
  if (sourceLength === 0 || targetLength === 0) {
    return identity();
  }
  const cosine = dot(source, target);
  if (cosine > 1 - 1e-8) {
    return identity();
  }
  if (cosine < -1 + 1e-8) {
    const axis = Math.abs(source.x) < 0.9 ? cross(source, vec3(1, 0, 0)) : cross(source, vec3(0, 1, 0));
    return fromAxisAngle(axis, Math.PI);
  }
  const axis = cross(source, target);
  return normalize(quat(axis.x, axis.y, axis.z, 1 + cosine));
};
