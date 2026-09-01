import type { PartDefinition } from "./part-definition.js";
import { createRectPart, type StandardRectOptions } from "./standard-part-generator.js";

export const STANDARD_PART_CATALOG: readonly StandardRectOptions[] = [
  { id: "brick-1x1", width: 1, depth: 1, height: "brick" },
  { id: "brick-1x2", width: 1, depth: 2, height: "brick" },
  { id: "brick-1x3", width: 1, depth: 3, height: "brick" },
  { id: "brick-1x4", width: 1, depth: 4, height: "brick" },
  { id: "brick-2x2", width: 2, depth: 2, height: "brick" },
  { id: "brick-2x3", width: 2, depth: 3, height: "brick" },
  { id: "brick-2x4", width: 2, depth: 4, height: "brick" },
  { id: "brick-2x6", width: 2, depth: 6, height: "brick" },
  { id: "plate-1x1", width: 1, depth: 1, height: "plate" },
  { id: "plate-1x2", width: 1, depth: 2, height: "plate" },
  { id: "plate-1x4", width: 1, depth: 4, height: "plate" },
  { id: "plate-2x2", width: 2, depth: 2, height: "plate" },
  { id: "plate-2x4", width: 2, depth: 4, height: "plate" },
  { id: "tile-1x1", width: 1, depth: 1, height: "plate", category: "tile", topStuds: false },
  { id: "tile-1x2", width: 1, depth: 2, height: "plate", category: "tile", topStuds: false },
  { id: "tile-2x2", width: 2, depth: 2, height: "plate", category: "tile", topStuds: false }
];

export const createStandardPartDefinitions = (): PartDefinition[] => STANDARD_PART_CATALOG.map((options) => createRectPart({
  ...options,
  name: displayName(options.id)
}));

const displayName = (id: string): string => {
  const [kind, size] = id.split("-");
  const label = kind === "plate" ? "Plate" : kind === "tile" ? "Tile" : "Brick";
  return `${label} ${size ?? ""}`.trim();
};
