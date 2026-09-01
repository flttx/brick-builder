export type BrickColorGroup = "basic" | "neutral" | "special";

export interface BrickColor {
  id: string;
  name: string;
  baseColor: string;
  transparent?: boolean;
  sortOrder: number;
  group?: BrickColorGroup;
}

export const DEFAULT_BRICK_COLORS: BrickColor[] = [
  { id: "red", name: "Red", baseColor: "#d84b43", sortOrder: 10, group: "basic" },
  { id: "blue", name: "Blue", baseColor: "#2f79c5", sortOrder: 20, group: "basic" },
  { id: "yellow", name: "Yellow", baseColor: "#f0bd3f", sortOrder: 30, group: "basic" },
  { id: "green", name: "Green", baseColor: "#4f9b68", sortOrder: 40, group: "basic" },
  { id: "white", name: "White", baseColor: "#f0f2ed", sortOrder: 50, group: "neutral" },
  { id: "black", name: "Black", baseColor: "#202628", sortOrder: 60, group: "neutral" },
  { id: "light-gray", name: "Light Gray", baseColor: "#aeb7b5", sortOrder: 70, group: "neutral" },
  { id: "dark-gray", name: "Dark Gray", baseColor: "#586466", sortOrder: 80, group: "neutral" },
  { id: "brown", name: "Brown", baseColor: "#8c5c3d", sortOrder: 90, group: "special" },
  { id: "orange", name: "Orange", baseColor: "#e67e32", sortOrder: 100, group: "special" }
];

export class BrickColorRegistry {
  private readonly colors = new Map<string, BrickColor>();

  public constructor(colors: BrickColor[] = DEFAULT_BRICK_COLORS) {
    for (const color of colors) {
      this.register(color);
    }
  }

  public register(color: BrickColor): void {
    if (this.colors.has(color.id)) {
      throw new Error(`Color ${color.id} is already registered`);
    }
    this.colors.set(color.id, { ...color, transparent: color.transparent ?? false });
  }

  public get(colorId: string): BrickColor {
    const color = this.colors.get(colorId);
    if (color === undefined) {
      throw new Error(`Color ${colorId} is not registered`);
    }
    return { ...color };
  }

  public tryGet(colorId: string): BrickColor | undefined {
    const color = this.colors.get(colorId);
    return color === undefined ? undefined : { ...color };
  }

  public has(colorId: string): boolean {
    return this.colors.has(colorId);
  }

  public values(): BrickColor[] {
    return [...this.colors.values()].sort((a, b) => a.sortOrder - b.sortOrder).map((color) => ({ ...color }));
  }
}

export const createDefaultBrickColorRegistry = (): BrickColorRegistry => new BrickColorRegistry();
