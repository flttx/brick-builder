import type { Quat } from "./quat.js";
import { identity, inverse as inverseQuat, multiply, normalize, rotateVector } from "./quat.js";
import type { Vec3 } from "./vec3.js";
import { add, cloneVec3, subtract } from "./vec3.js";

export interface Transform {
  position: Vec3;
  rotation: Quat;
}

export const identityTransform = (): Transform => ({
  position: { x: 0, y: 0, z: 0 },
  rotation: identity()
});

export const cloneTransform = (value: Transform): Transform => ({
  position: cloneVec3(value.position),
  rotation: normalize(value.rotation)
});

/** Applies local transform b after parent/world transform a. */
export const compose = (a: Transform, b: Transform): Transform => ({
  position: add(a.position, rotateVector(a.rotation, b.position)),
  rotation: normalize(multiply(a.rotation, b.rotation))
});

export const inverse = (value: Transform): Transform => {
  const rotation = inverseQuat(value.rotation);
  return {
    position: rotateVector(rotation, { x: -value.position.x, y: -value.position.y, z: -value.position.z }),
    rotation: normalize(rotation)
  };
};

export const transformPoint = (transform: Transform, point: Vec3): Vec3 =>
  add(transform.position, rotateVector(transform.rotation, point));

export const transformDirection = (transform: Transform, direction: Vec3): Vec3 =>
  rotateVector(transform.rotation, direction);

export const inverseTransformPoint = (transform: Transform, point: Vec3): Vec3 =>
  rotateVector(inverseQuat(transform.rotation), subtract(point, transform.position));

export const equals = (a: Transform, b: Transform, epsilon = 1e-6): boolean => {
  const positionEqual =
    Math.abs(a.position.x - b.position.x) <= epsilon &&
    Math.abs(a.position.y - b.position.y) <= epsilon &&
    Math.abs(a.position.z - b.position.z) <= epsilon;
  const rotation = normalize(multiply(inverseQuat(a.rotation), b.rotation));
  return positionEqual && Math.abs(rotation.w) >= Math.cos(epsilon / 2);
};
