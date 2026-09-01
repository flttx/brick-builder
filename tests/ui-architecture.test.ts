import { describe, expect, it } from "vitest";
import { closeEditorPanels, openEditorPanel } from "../apps/web/src/editor/ui/editor-ui-state.js";

describe("editor UI panel state", () => {
  it("keeps one contextual drawer active at a time", () => {
    const parts = openEditorPanel({ activePanel: null, debugOpen: false }, "parts");
    const color = openEditorPanel(parts, "color");

    expect(parts).toEqual({ activePanel: "parts", debugOpen: false });
    expect(color).toEqual({ activePanel: "color", debugOpen: false });
  });

  it("separates the developer drawer from production contextual panels", () => {
    expect(openEditorPanel({ activePanel: "settings", debugOpen: false }, "debug")).toEqual({ activePanel: null, debugOpen: true });
    expect(closeEditorPanels()).toEqual({ activePanel: null, debugOpen: false });
  });
});
