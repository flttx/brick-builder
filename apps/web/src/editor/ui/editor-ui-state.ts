export type EditorPanel = "parts" | "bucket" | "color" | "settings" | "debug";
export type ActiveTool = "move" | "precision_connect";

export interface EditorPanelState {
  activePanel: EditorPanel | null;
  debugOpen: boolean;
}

export const openEditorPanel = (state: EditorPanelState, panel: EditorPanel): EditorPanelState => ({
  activePanel: panel === "debug" ? null : panel,
  debugOpen: panel === "debug"
});

export const closeEditorPanels = (): EditorPanelState => ({ activePanel: null, debugOpen: false });
