import type { UiPlacementMode } from "./types.js";
import { zhCN } from "./zh-CN.js";

export { zhCN } from "./zh-CN.js";
export type { UiMessages, UiPartCategory, UiPlacementMode } from "./types.js";

export const messages = zhCN;

export const localizeCategory = (category: string): string => messages.parts.categoryName(category);

export const localizePartName = (partId: string, fallbackName?: string): string => {
  const match = /^(brick|plate|tile)-(\d+x\d+)$/.exec(partId);
  if (match?.[1] !== undefined && match[2] !== undefined) {
    return messages.parts.partName(messages.parts.categoryName(match[1]), match[2]);
  }
  return fallbackName ?? partId;
};

export const localizeColorName = (colorId: string, fallbackName?: string): string => {
  return messages.colors[colorId] ?? fallbackName ?? colorId;
};

export const localizePlacementMode = (mode: UiPlacementMode): string => messages.editor.placement.modes[mode];

export const localizeInteractionState = (state: string): string => {
  return messages.interactionStates[state] ?? state;
};

export const localizeConnectorType = (type: string): string => messages.authoring.connectorType(type);
export const localizeColliderType = (type: string): string => messages.authoring.colliderType(type);

export const localizeProjectName = (name: string): string => {
  if (name === "Untitled Build") return messages.builds.untitled;
  if (name === "Offline draft") return messages.builds.offlineDraft;
  return name;
};

export const messageForErrorCode = (code: string | undefined): string => { const fallback = messages.errors.REQUEST_FAILED; return code === undefined ? fallback : messages.errors[code] ?? fallback; };

export const formatDateTimeZhCN = (value: string | number | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
};
