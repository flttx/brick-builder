import type { Vec3 } from "../math/vec3.js";

export type ColliderType = "box";

export interface ColliderDefinition {
  id: string;
  type: ColliderType;
  center: Vec3;
  size: Vec3;
}
