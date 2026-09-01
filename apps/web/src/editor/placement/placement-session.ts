export type PlacementSource = "bucket" | "browser" | "duplicate" | "recent";
export type PlacementState = "loading" | "preview" | "placing";

export interface NewBrickPlacementSession {
  id: number;
  partId: string;
  colorId: string;
  source: PlacementSource;
  state: PlacementState;
}

export const createPlacementSession = (id: number, partId: string, colorId: string, source: PlacementSource): NewBrickPlacementSession => ({
  id,
  partId,
  colorId,
  source,
  state: "preview"
});
