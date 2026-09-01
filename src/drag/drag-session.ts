import type { SnapCandidate } from "../snap/snap-types.js";
import type { Transform } from "../math/transform.js";
import type { ConnectionGroup } from "../connections/connection-types.js";
import type { PlacementMode } from "./placement-mode.js";

export interface DragSession {
  brickId: string;
  startTransform: Transform;
  currentTransform: Transform;
  snapCandidate?: SnapCandidate;
  mode: "free" | "snap";
  placementMode: PlacementMode;
}

export interface DetachSnapshot {
  brickId: string;
  transform: Transform;
  removedGroups: ConnectionGroup[];
}
