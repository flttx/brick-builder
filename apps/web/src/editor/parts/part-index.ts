import type { PartDefinition } from "../../../../../src/index.js";
import type { RuntimePartsIndexItem } from "../../../../../packages/brick-assets/asset-types.js";

export interface PartIndexItem {
  id: string;
  name: string;
  category: PartDefinition["category"];
  tags: string[];
  aliases: string[];
  dimensions: { width: number; height: number; depth: number };
  thumbnail?: string;
  manifestUrl?: string;
}

export const createPartIndex = (parts: PartDefinition[]): PartIndexItem[] => parts.filter((part) => part.metadata?.deprecated !== true).map((part) => {
  const size = `${part.dimensions.width}x${part.dimensions.depth}`;
  const categoryName = part.category === "brick" || part.category === "plate" || part.category === "tile" ? part.category : "special";
  const categoryAlias = categoryName === "brick" ? "砖" : categoryName === "plate" ? "板" : categoryName === "tile" ? "平板" : "特殊件";
  return {
    id: part.id,
    name: part.name,
    category: part.category,
    tags: [categoryName, size, `${part.dimensions.width}×${part.dimensions.depth}`],
    aliases: [part.id, size, `${part.dimensions.width}×${part.dimensions.depth}`, categoryName, categoryAlias],
    dimensions: { ...part.dimensions }
  };
});

export const mergePartIndexes = (runtime: PartIndexItem[], local: PartIndexItem[]): PartIndexItem[] => {
  const ids = new Set(runtime.map((item) => item.id));
  return [...runtime, ...local.filter((item) => !ids.has(item.id))];
};

export const createRuntimePartIndex = (items: RuntimePartsIndexItem[]): PartIndexItem[] => items.map((item) => ({
  id: item.id,
  name: item.name,
  category: item.category,
  tags: [...item.tags],
  aliases: [...item.aliases],
  dimensions: { ...item.dimensions },
  thumbnail: item.thumbnail,
  manifestUrl: item.manifestUrl
}));

export const isRuntimePartIndex = (value: unknown): value is RuntimePartsIndexItem[] => Array.isArray(value) && value.every((item) => {
  if (typeof item !== "object" || item === null) return false;
  const candidate = item as Partial<RuntimePartsIndexItem>;
  return typeof candidate.id === "string" && typeof candidate.name === "string" && typeof candidate.thumbnail === "string" && typeof candidate.manifestUrl === "string" && typeof candidate.dimensions === "object" && candidate.dimensions !== null;
});

export const searchParts = (query: string, items: PartIndexItem[]): PartIndexItem[] => {
  const normalized = normalizeSearchText(query);
  if (normalized.length === 0) {
    return [...items];
  }
  return items
    .map((item, index) => ({ item, index, score: scorePart(normalized, item) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
};

export const normalizeSearchText = (value: string): string => value
  .trim()
  .toLocaleLowerCase()
  .replaceAll("×", "x")
  .replaceAll("*", "x")
  .replaceAll(/\s+/g, "");

const scorePart = (query: string, item: PartIndexItem): number => {
  const name = normalizeSearchText(item.name);
  const aliases = item.aliases.map(normalizeSearchText);
  const tags = item.tags.map(normalizeSearchText);
  if (aliases.some((alias) => alias === query)) {
    return 400;
  }
  if (name.startsWith(query)) {
    return 300;
  }
  if (tags.some((tag) => tag.startsWith(query))) {
    return 200;
  }
  if (name.includes(query) || aliases.some((alias) => alias.includes(query)) || tags.some((tag) => tag.includes(query))) {
    return 100;
  }
  return 0;
};
