import { useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import type { BrickColor } from "../../../../../src/colors/brick-color.js";
import type { PartIndexItem } from "./part-index.js";
import { searchParts } from "./part-index.js";
import { localizeColorName, localizePartName, messages } from "../../i18n/index.js";
import type { UiSpecialPartGroup } from "../../i18n/types.js";

export interface PartBrowserProps {
  open: boolean;
  items: PartIndexItem[];
  recentPartIds: string[];
  colors: BrickColor[];
  currentColorId: string;
  onClose: () => void;
  onColorSelect: (color: BrickColor) => void;
  onSelect: (partId: string) => void;
}

export const PartBrowser = ({ open, items, recentPartIds, colors, currentColorId, onClose, onColorSelect, onSelect }: PartBrowserProps): ReactElement | null => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PartIndexItem["category"] | "recent">("recent");
  const [specialGroup, setSpecialGroup] = useState<UiSpecialPartGroup>("all");
  const recentItems = recentPartIds.map((id) => items.find((item) => item.id === id)).filter((item): item is PartIndexItem => item !== undefined);
  const currentColor = colors.find((color) => color.id === currentColorId);
  const visibleItems = useMemo(() => {
    const source = category === "recent" && query.trim().length === 0
      ? (recentItems.length > 0 ? recentItems : items)
      : category === "recent" ? items
        : category === "special" && specialGroup !== "all"
          ? items.filter((item) => item.category === category && item.specialGroup === specialGroup)
          : items.filter((item) => item.category === category);
    return searchParts(query, source);
  }, [category, items, query, recentItems, specialGroup]);

  const selectCategory = (nextCategory: PartIndexItem["category"] | "recent"): void => {
    setCategory(nextCategory);
    if (nextCategory !== "special") setSpecialGroup("all");
  };

  if (!open) {
    return null;
  }
  return (
    <aside className="parts-browser" aria-label={messages.parts.ariaLabel} data-open="true">
      <div className="parts-browser-head">
        <div>
          <span className="section-label">{messages.parts.library}</span>
          <h2>{messages.parts.choosePart}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label={messages.parts.close}>×</button>
      </div>
      <div className="parts-color-picker">
        <div className="parts-color-picker-head"><span className="section-label">{messages.editor.panels.colorTitle}</span><strong>{currentColor === undefined ? currentColorId : localizeColorName(currentColor.id, currentColor.name)}</strong></div>
        <div className="parts-color-options" role="group" aria-label={messages.editor.colorPalette}>
          {colors.map((color) => <button key={color.id} className={`parts-color-option${currentColorId === color.id ? " is-active" : ""}`} type="button" style={{ "--swatch": color.baseColor } as CSSProperties} aria-label={messages.editor.useColor(localizeColorName(color.id, color.name))} aria-pressed={currentColorId === color.id} title={localizeColorName(color.id, color.name)} onClick={() => onColorSelect(color)} />)}
        </div>
      </div>
      <label className="parts-search">
        <span className="sr-only">{messages.parts.searchLabel}</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={messages.parts.searchPlaceholder} />
      </label>
      <div className="parts-tabs" role="tablist" aria-label={messages.parts.categories.recent}>
        {(["recent", "brick", "plate", "tile", "special"] as const).map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={category === tab} className={category === tab ? "is-active" : ""} onClick={() => selectCategory(tab)}>
            {messages.parts.categories[tab]}
          </button>
        ))}
      </div>
      {category === "special" && <div className="parts-tabs parts-subtabs" role="tablist" aria-label={messages.parts.categories.special}>
        {(["all", "wheel", "plant", "flag", "antenna", "technic", "other"] as const).map((group) => (
          <button key={group} type="button" role="tab" aria-selected={specialGroup === group} className={specialGroup === group ? "is-active" : ""} onClick={() => setSpecialGroup(group)}>
            {messages.parts.specialGroups[group]}
          </button>
        ))}
      </div>}
      <div className="part-grid">
        {visibleItems.length === 0 ? <p className="parts-empty">{messages.parts.noMatches}</p> : visibleItems.map((item) => {
          const displayName = localizePartName(item.id, item.name);
          return <button className="part-card" key={item.id} type="button" onClick={() => onSelect(item.id)} aria-label={messages.parts.place(displayName)}>
            {item.thumbnail === undefined ? <span className={`part-thumb part-thumb-${item.category} part-thumb-${item.id}`} aria-hidden="true"><span /></span> : <img className="part-thumb-image" src={item.thumbnail} alt="" aria-hidden="true" />}
            <strong>{displayName}</strong>
            <small>{item.dimensions.width}×{item.dimensions.depth}</small>
          </button>
        })}
      </div>
    </aside>
  );
};
