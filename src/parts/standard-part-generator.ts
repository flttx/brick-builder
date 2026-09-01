import { identity } from "../math/quat.js";
import type { PartDefinition } from "./part-definition.js";
import type { ConnectorDefinition } from "../connectors/connector.js";
import type { Vec3 } from "../math/vec3.js";

export type StandardHeight = "brick" | "plate";

export interface StandardBrickOptions {
  id: string;
  width: number;
  depth: number;
  height?: StandardHeight;
  name?: string;
  colliderInset?: number;
  category?: PartDefinition["category"];
}

export interface StandardRectOptions extends StandardBrickOptions {
  topStuds?: boolean;
  bottomSockets?: boolean;
}

export const STANDARD_BRICK_HEIGHT = 1.2;
export const STANDARD_PLATE_HEIGHT = 0.4;
export const STANDARD_STUD_RADIUS = 0.25;

export const createStandardBrickDefinition = (options: StandardBrickOptions): PartDefinition => {
  return createRectPart({ ...options, topStuds: true, bottomSockets: true });
};

export const createRectPart = (options: StandardRectOptions): PartDefinition => {
  if (!Number.isInteger(options.width) || options.width <= 0 || !Number.isInteger(options.depth) || options.depth <= 0) {
    throw new Error("Standard brick width and depth must be positive integers");
  }
  const height = options.height === "plate" ? STANDARD_PLATE_HEIGHT : STANDARD_BRICK_HEIGHT;
  const inset = options.colliderInset ?? 0.04;
  const connectors = createGridConnectors(options.width, options.depth, height, options.topStuds ?? true, options.bottomSockets ?? true);
  return {
    id: options.id,
    name: options.name ?? `${options.width}x${options.depth} ${options.category ?? options.height ?? "brick"}`,
    category: options.category ?? (options.height === "plate" ? "plate" : "brick"),
    dimensions: {
      width: options.width,
      height,
      depth: options.depth
    },
    connectors,
    colliders: [
      {
        id: "main",
        type: "box",
        center: { x: 0, y: 0, z: 0 },
        size: {
          x: Math.max(0, options.width - inset),
          y: Math.max(0, height - inset),
          z: Math.max(0, options.depth - inset)
        }
      }
    ],
    origin: { x: 0, y: 0, z: 0 },
    metadata: {
      generated: true,
      studRadius: STANDARD_STUD_RADIUS
    }
  };
};

const createGridConnectors = (width: number, depth: number, height: number, topStuds: boolean, bottomSockets: boolean): ConnectorDefinition[] => {
  const connectors: ConnectorDefinition[] = [];
  const topY = height / 2;
  const bottomY = -height / 2;
  for (let x = 0; x < width; x += 1) {
    for (let z = 0; z < depth; z += 1) {
      const position: Vec3 = {
        x: x - (width - 1) / 2,
        y: topY,
        z: z - (depth - 1) / 2
      };
      if (topStuds) {
        connectors.push({
          id: `stud-${x}-${z}`,
          type: "stud",
          role: "plug",
          position,
          rotation: identity(),
          normal: { x: 0, y: 1, z: 0 },
          compatibilityGroup: "standard-stud",
          snapRadius: 0.3,
          occupiedRule: "single"
        });
      }
      if (bottomSockets) {
        connectors.push({
          id: `anti-stud-${x}-${z}`,
          type: "anti_stud",
          role: "socket",
          position: { ...position, y: bottomY },
          rotation: identity(),
          normal: { x: 0, y: -1, z: 0 },
          compatibilityGroup: "standard-stud",
          snapRadius: 0.3,
          occupiedRule: "single"
        });
      }
    }
  }
  return connectors;
};
