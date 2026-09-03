import type { ReactElement } from "react";
import { messages } from "../../i18n/index.js";

export interface ScenePartListItem {
  id: string;
  index: number;
  partName: string;
  colorName: string;
  colorHex: string;
}

export interface ScenePartsPanelProps {
  open: boolean;
  items: ScenePartListItem[];
  selectedBrickId?: string | undefined;
  onSelect: (brickId: string) => void;
  onClose: () => void;
}

export const ScenePartsPanel = ({ open, items, selectedBrickId, onSelect, onClose }: ScenePartsPanelProps): ReactElement | null => {
  if (!open) {
    return null;
  }

  return (
    <aside className="editor-drawer left-drawer scene-parts-drawer" aria-label={messages.editor.toolbar.scene}>
      <div className="drawer-header">
        <div>
          <h2>{messages.editor.panels.sceneTitle}</h2>
        </div>
        <span className="scene-parts-count">{messages.editor.panels.sceneCount(items.length)}</span>
        <button className="drawer-close" type="button" onClick={onClose} aria-label={messages.common.close}>×</button>
      </div>
      {items.length === 0 ? <p className="scene-parts-empty">{messages.editor.panels.sceneEmpty}</p> : <ul className="scene-parts-list" aria-label={messages.editor.panels.sceneTitle}>
        {items.map((item) => {
          const selected = selectedBrickId === item.id;
          return <li key={item.id}><button className={`scene-part-row${selected ? " is-selected" : ""}`} type="button" aria-pressed={selected} aria-label={messages.editor.panels.sceneItemAria(item.partName, item.index)} onClick={() => onSelect(item.id)}>
              <span className="scene-part-index" aria-hidden="true">{String(item.index).padStart(2, "0")}</span>
              <span className="scene-part-swatch" style={{ backgroundColor: item.colorHex }} aria-hidden="true" />
              <span className="scene-part-copy"><strong>{item.partName}</strong><small>{item.colorName}</small></span>
              <span className="scene-part-selection" aria-hidden="true" />
            </button></li>;
        })}
      </ul>}
    </aside>
  );
};
