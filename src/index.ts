export {
  add,
  subtract,
  scale,
  dot,
  cross,
  length,
  lengthSquared,
  normalize,
  distance,
  equals as vec3Equals,
  negate,
  vec3
} from "./math/vec3.js";
export type { Vec3 } from "./math/vec3.js";
export {
  quat,
  identity,
  cloneQuat,
  length as quatLength,
  lengthSquared as quatLengthSquared,
  normalize as normalizeQuat,
  multiply,
  conjugate,
  inverse as inverseQuat,
  fromAxisAngle,
  axisRotationQuarter,
  yRotationQuarter,
  rotateVector,
  angleBetween,
  angleBetweenVectors,
  alignVectorRotation
} from "./math/quat.js";
export type { Quat, RotationAxis } from "./math/quat.js";
export {
  identityTransform,
  GROUND_LEVEL,
  cloneTransform,
  compose,
  inverse as inverseTransform,
  transformPoint,
  transformDirection,
  inverseTransformPoint,
  equals as transformEquals
} from "./math/transform.js";
export type { Transform } from "./math/transform.js";
export * from "./math/quantize.js";

export * from "./collision/aabb.js";
export * from "./collision/box-collision.js";
export * from "./collision/collider-definition.js";
export * from "./collision/collision-solver.js";

export * from "./connectors/connector.js";
export * from "./connectors/compatibility.js";
export * from "./connectors/occupancy-index.js";
export * from "./connectors/connector-system.js";
export * from "./connectors/connector-spatial-index.js";
export * from "./connectors/world-connector.js";

export * from "./parts/brick-instance.js";
export * from "./parts/brick-store.js";
export * from "./parts/part-definition.js";
export * from "./parts/part-registry.js";
export * from "./parts/part-validation.js";
export * from "./parts/standard-part-generator.js";
export * from "./parts/standard-part-catalog.js";
export * from "./parts/special-part-generator.js";
export * from "./colors/brick-color.js";
export * from "./bucket/brick-bucket.js";

export * from "./spatial/spatial-hash.js";
export * from "./spatial/brick-spatial-index.js";

export * from "./snap/snap-config.js";
export * from "./snap/snap-types.js";
export * from "./snap/transform-solver.js";
export * from "./snap/precision-transform-solver.js";
export * from "./snap/candidate-generator.js";
export * from "./snap/candidate-scorer.js";
export * from "./snap/snap-solver.js";

export * from "./connections/connection-types.js";
export * from "./connections/connection-graph.js";
export * from "./connections/connection-manager.js";
export * from "./connections/consistency-validator.js";

export * from "./drag/drag-session.js";
export * from "./drag/placement-mode.js";
export * from "./drag/detach-controller.js";
export * from "./drag/placement-validator.js";

export * from "./commands/command.js";
export * from "./commands/command-history.js";
export * from "./commands/add-brick-command.js";
export * from "./commands/add-placed-brick-command.js";
export * from "./commands/change-color-command.js";
export * from "./commands/place-brick-command.js";
export * from "./commands/delete-brick-command.js";
export * from "./commands/rotate-brick-command.js";

export * from "./serialization/project-snapshot.js";
export * from "./serialization/project-loader.js";
export * from "./engine/brick-engine.js";
