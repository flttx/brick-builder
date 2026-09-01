import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { PartIndexItem } from "./part-index.js";
import { searchParts } from "./part-index.js";
import { localizePartName, messages } from "../../i18n/index.js";

export interface PartBrowserProps {
  open: boolean;
  items: PartIndexItem[];
  recentPartIds: string[];
  onClose: () => void;
  onSelect: (partId: string) => void;
}

export const PartBrowser = ({ open, items, recentPartIds, onClose, onSelect }: PartBrowserProps): ReactElement | null => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PartIndexItem["category"] | "recent">("recent");
  const recentItems = recentPartIds.map((id) => items.find((item) => item.id === id)).filter((item): item is PartIndexItem => item !== undefined);
  const visibleItems = useMemo(() => {
    const source = category === "recent" && query.trim().length === 0
      ? (recentItems.length > 0 ? recentItems : items)
      : category === "recent" ? items : items.filter((item) => item.category === category);
    return searchParts(query, source);
  }, [category, items, query, recentItems]);

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
      <label className="parts-search">
        <span className="sr-only">{messages.parts.searchLabel}</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={messages.parts.searchPlaceholder} />
      </label>
      <div className="parts-tabs" role="tablist" aria-label={messages.parts.categories.recent}>
        {(["recent", "brick", "plate", "tile", "special"] as const).map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={category === tab} className={category === tab ? "is-active" : ""} onClick={() => setCategory(tab)}>
            {messages.parts.categories[tab]}
          </button>
        ))}
      </div>
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
