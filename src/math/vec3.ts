export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const cloneVec3 = (value: Vec3): Vec3 => ({ ...value });

export const add = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z
});

export const subtract = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z
});

export const scale = (value: Vec3, factor: number): Vec3 => ({
  x: value.x * factor,
  y: value.y * factor,
  z: value.z * factor
});

export const negate = (value: Vec3): Vec3 => scale(value, -1);

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});

export const lengthSquared = (value: Vec3): number => dot(value, value);

export const length = (value: Vec3): number => Math.sqrt(lengthSquared(value));

export const normalize = (value: Vec3): Vec3 => {
  const magnitude = length(value);
  if (magnitude === 0) {
    return vec3();
  }
  return scale(value, 1 / magnitude);
};

export const distance = (a: Vec3, b: Vec3): number => length(subtract(a, b));

export const equals = (a: Vec3, b: Vec3, epsilon = 1e-6): boolean =>
  Math.abs(a.x - b.x) <= epsilon &&
  Math.abs(a.y - b.y) <= epsilon &&
  Math.abs(a.z - b.z) <= epsilon;

export const isFiniteVec3 = (value: Vec3): boolean =>
  Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
