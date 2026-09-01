import type { Transform } from "../math/transform.js";

export interface BrickInstance {
  id: string;
  partId: string;
  colorId: string;
  transform: Transform;
  locked?: boolean;
  visible?: boolean;
}
