import type { PartDefinition } from "./part-definition.js";
import { createRectPart, type StandardRectOptions } from "./standard-part-generator.js";
import { createLDrawPartDefinition, createSpecialPartDefinition, createTechnicAxleDefinition, type LDrawPartDefinitionOptions, type SpecialPartOptions, type TechnicAxleOptions } from "./special-part-generator.js";

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

export const SPECIAL_PART_CATALOG: readonly SpecialPartOptions[] = [
  { id: "wheel-1x1", kind: "wheel" },
  { id: "flagpole-1x1", kind: "flagpole" },
  { id: "leaf-1x1", kind: "leaf" }
];

export const TECHNIC_PART_CATALOG: readonly TechnicAxleOptions[] = [
  { id: "technic-axle-4", name: "Technic 车轴 4L", length: 4.8 }
];

export const LDRAW_PART_CATALOG: readonly LDrawPartDefinitionOptions[] = [
  { id: "ldraw-wheel-3482", name: "小车轮 8×17.5（3482）", ldrawPartId: "3482c01.dat", dimensions: { width: 3.1, height: 3.1, depth: 1 }, status: "official" },
  { id: "ldraw-wheel-56145", name: "中型车轮 20×30（56145）", ldrawPartId: "56145c01.dat", dimensions: { width: 5.4, height: 5.4, depth: 3.3 }, status: "official" },
  { id: "ldraw-wheel-56908", name: "越野车轮 26×43（56908）", ldrawPartId: "56908c01.dat", dimensions: { width: 10.23, height: 10.23, depth: 4.8 }, status: "official" },
  { id: "ldraw-wheel-110100", name: "光滑赛车轮 14.9×24（110100）", ldrawPartId: "110100.dat", dimensions: { width: 3, height: 3, depth: 1.99 }, status: "official" },
  { id: "ldraw-wheel-7877", name: "大轮毂 12 辐（7877）", ldrawPartId: "7877.dat", dimensions: { width: 7, height: 7, depth: 1.63 }, status: "official" },
  { id: "ldraw-wheel-64711", name: "带刺轮（64711）", ldrawPartId: "64711.dat", dimensions: { width: 7.65, height: 7.7, depth: 2.5 }, status: "official" },
  { id: "ldraw-wheel-64712", name: "锥形带刺轮（64712）", ldrawPartId: "64712.dat", dimensions: { width: 7.79, height: 7.72, depth: 3.95 }, status: "official" },
  { id: "ldraw-leaf-10884", name: "剑叶（10884）", ldrawPartId: "10884.dat", dimensions: { width: 5.67, height: 1.68, depth: 5.98 }, status: "official" },
  { id: "ldraw-grass-15279", name: "草茎（15279）", ldrawPartId: "15279.dat", dimensions: { width: 0.8, height: 3.2, depth: 1.71 }, status: "official" },
  { id: "ldraw-flower-15515", name: "花朵（15515）", ldrawPartId: "15515.dat", dimensions: { width: 7.65, height: 2.95, depth: 7.87 }, status: "official" },
  { id: "ldraw-vine-16981", name: "藤蔓 16L（16981）", ldrawPartId: "16981.dat", dimensions: { width: 16, height: 0.75, depth: 3.04 }, status: "official" },
  { id: "ldraw-leaf-7096", name: "叶片 5×6（7096，未审核）", ldrawPartId: "7096.dat", dimensions: { width: 3.91, height: 1.67, depth: 5.98 }, status: "unofficial" },
  { id: "ldraw-pole-23421", name: "长杆 32L（23421）", ldrawPartId: "23421.dat", dimensions: { width: 32, height: 0.6, depth: 0.6 }, status: "official" },
  { id: "ldraw-flag-2335", name: "标准旗面 2×2（2335）", ldrawPartId: "2335.dat", dimensions: { width: 0.66, height: 2, depth: 2.7 }, status: "official" },
  { id: "ldraw-antenna-104", name: "6 高度天线（104）", ldrawPartId: "104.dat", dimensions: { width: 0.5, height: 7.25, depth: 0.5 }, status: "official" },
  { id: "ldraw-antenna-6899", name: "人仔天线（6899）", ldrawPartId: "6899.dat", dimensions: { width: 1.85, height: 1.05, depth: 0.72 }, status: "official" },
  { id: "ldraw-fishing-rod-2614", name: "钓鱼竿（2614）", ldrawPartId: "2614.dat", dimensions: { width: 0.8, height: 12.16, depth: 1.4 }, status: "official" },
  { id: "ldraw-steering-wheel-16091", name: "汽车方向盘（16091）", ldrawPartId: "16091.dat", dimensions: { width: 2, height: 0.8, depth: 2 }, status: "official" },
  { id: "ldraw-steering-wheel-30663", name: "Technic 方向盘（30663）", ldrawPartId: "30663.dat", dimensions: { width: 2, height: 0.8, depth: 2 }, status: "official" },
  { id: "ldraw-train-wheel-243c01", name: "火车轮（243c01）", ldrawPartId: "243c01.dat", dimensions: { width: 2.8, height: 2.8, depth: 2.3 }, status: "official" },
  { id: "ldraw-claw-15362", name: "机械爪钩（15362）", ldrawPartId: "15362.dat", dimensions: { width: 1.93, height: 1.91, depth: 6.42 }, status: "official" }
];

export const createSpecialPartDefinitions = (): PartDefinition[] => [
  ...SPECIAL_PART_CATALOG.map((options) => createSpecialPartDefinition(options)),
  ...TECHNIC_PART_CATALOG.map((options) => createTechnicAxleDefinition(options)),
  ...LDRAW_PART_CATALOG.map((options) => createLDrawPartDefinition(options))
];

export const createStandardPartDefinitions = (): PartDefinition[] => [
  ...STANDARD_PART_CATALOG.map((options) => createRectPart({ ...options, name: displayName(options.id) })),
  ...createSpecialPartDefinitions()
];

const displayName = (id: string): string => {
  const [kind, size] = id.split("-");
  const label = kind === "plate" ? "Plate" : kind === "tile" ? "Tile" : "Brick";
  return `${label} ${size ?? ""}`.trim();
};
