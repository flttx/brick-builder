import type { ColliderDefinition, ConnectorDefinition, PartDefinition } from "../../src/index.js";
import { createRectPart } from "../../src/parts/standard-part-generator.js";
import type { RectPartTemplate } from "./asset-types.js";

export const generateConnectors = (partId: string, template: RectPartTemplate): ConnectorDefinition[] => createRectPart({
  id: partId,
  width: template.width,
  depth: template.depth,
  height: template.type === "brick" ? "brick" : "plate",
  category: template.type,
  topStuds: template.topStuds,
  bottomSockets: template.bottomSockets
}).connectors;

export const generateColliders = (part: PartDefinition, inset = 0.04): ColliderDefinition[] => [{
  id: "main",
  type: "box",
  center: { ...part.origin },
  size: {
    x: Math.max(0.01, part.dimensions.width - inset),
    y: Math.max(0.01, part.dimensions.height - inset),
    z: Math.max(0.01, part.dimensions.depth - inset)
  }
}];
