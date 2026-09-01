import * as THREE from "three";
import type { Quat, Transform, Vec3 } from "../../../../../src/index.js";

export const toThreeVector = (value: Vec3, target?: THREE.Vector3): THREE.Vector3 =>
  (target ?? new THREE.Vector3()).set(value.x, value.y, value.z);

export const toThreeQuaternion = (value: Quat, target?: THREE.Quaternion): THREE.Quaternion =>
  (target ?? new THREE.Quaternion()).set(value.x, value.y, value.z, value.w);

export const toThreeMatrix = (transform: Transform, target?: THREE.Matrix4): THREE.Matrix4 =>
  (target ?? new THREE.Matrix4()).compose(
    toThreeVector(transform.position),
    toThreeQuaternion(transform.rotation),
    new THREE.Vector3(1, 1, 1)
  );

export const fromThreeVector = (value: THREE.Vector3): Vec3 => ({ x: value.x, y: value.y, z: value.z });

export const fromThreeQuaternion = (value: THREE.Quaternion): Quat => ({
  x: value.x,
  y: value.y,
  z: value.z,
  w: value.w
});

export const fromThreeMatrix = (value: THREE.Matrix4): Transform => {
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  value.decompose(position, rotation, scale);
  return {
    position: fromThreeVector(position),
    rotation: fromThreeQuaternion(rotation)
  };
};
