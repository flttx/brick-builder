import type { ConnectionGroup } from "../connections/connection-types.js";
import { cloneGroup } from "../connections/connection-graph.js";
import { cloneTransform, type Transform } from "../math/transform.js";
import type { DetachSnapshot } from "./drag-session.js";

export const createDetachSnapshot = (
  brickId: string,
  transform: Transform,
  removedGroups: ConnectionGroup[]
): DetachSnapshot => ({
  brickId,
  transform: cloneTransform(transform),
  removedGroups: removedGroups.map(cloneGroup)
});
