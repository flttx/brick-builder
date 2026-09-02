export interface LDrawPoint {
  x: number;
  y: number;
  z: number;
}

export interface LDrawMesh {
  positions: number[];
  indices: number[];
}

export interface LDrawLibrary {
  get(fileName: string): string | undefined;
}

export type LDrawMatrix = [number, number, number, number, number, number, number, number, number];

export interface LDrawReference {
  fileName: string;
  position: LDrawPoint;
  matrix: LDrawMatrix;
}

interface AffineTransform {
  translation: LDrawPoint;
  matrix: LDrawMatrix;
}

type LDrawWinding = "ccw" | "cw";

const IDENTITY: AffineTransform = {
  translation: { x: 0, y: 0, z: 0 },
  matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1]
};

export const parseLDrawPart = (fileName: string, library: LDrawLibrary, maxDepth = 32): LDrawMesh => {
  const positions: number[] = [];
  const indices: number[] = [];
  const stack = new Set<string>();

  const visit = (name: string, parent: AffineTransform, depth: number, inverted: boolean): void => {
    const key = name.toLocaleLowerCase();
    if (depth > maxDepth || stack.has(key)) return;
    const source = library.get(name);
    if (source === undefined) return;
    stack.add(key);
    let winding: LDrawWinding = "ccw";
    let invertNext = false;
    for (const rawLine of source.split(/\r?\n/u)) {
      const tokens = rawLine.trim().split(/\s+/u);
      const type = Number(tokens[0]);
      if (type === 0 && tokens[1]?.toLocaleUpperCase() === "BFC") {
        const directive = tokens[2]?.toLocaleUpperCase();
        if (directive === "CERTIFY") winding = tokens[3]?.toLocaleUpperCase() === "CW" ? "cw" : "ccw";
        if (directive === "INVERTNEXT") invertNext = true;
        continue;
      }
      if (type === 3 || type === 4) {
        const pointCount = type === 3 ? 3 : 4;
        const start = positions.length / 3;
        for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
          const offset = 2 + pointIndex * 3;
          const point = applyTransform(parent, {
            x: Number(tokens[offset]),
            y: Number(tokens[offset + 1]),
            z: Number(tokens[offset + 2])
          });
          positions.push(point.x, point.y, point.z);
        }
        const reverse = xor(inverted, winding === "cw");
        if (reverse) {
          indices.push(start, start + 2, start + 1);
          if (pointCount === 4) indices.push(start, start + 3, start + 2);
        } else {
          indices.push(start, start + 1, start + 2);
          if (pointCount === 4) indices.push(start, start + 2, start + 3);
        }
        invertNext = false;
      } else if (type === 1) {
        const childName = tokens[14];
        if (childName !== undefined) {
          const local: AffineTransform = {
            translation: { x: Number(tokens[2]), y: Number(tokens[3]), z: Number(tokens[4]) },
            matrix: [
              Number(tokens[5]), Number(tokens[6]), Number(tokens[7]),
              Number(tokens[8]), Number(tokens[9]), Number(tokens[10]),
              Number(tokens[11]), Number(tokens[12]), Number(tokens[13])
            ]
          };
          visit(childName, compose(parent, local), depth + 1, xor(xor(inverted, invertNext), determinant(local.matrix) < 0));
        }
        invertNext = false;
      }
    }
    stack.delete(key);
  };

  visit(fileName, IDENTITY, 0, false);
  return { positions, indices };
};

/** Returns every resolved subpart reference with the transform used by the mesh parser. */
export const parseLDrawReferences = (fileName: string, library: LDrawLibrary, maxDepth = 32): LDrawReference[] => {
  const references: LDrawReference[] = [];
  const stack = new Set<string>();

  const visit = (name: string, parent: AffineTransform, depth: number): void => {
    const key = name.toLocaleLowerCase();
    if (depth > maxDepth || stack.has(key)) return;
    const source = library.get(name);
    if (source === undefined) return;
    stack.add(key);
    for (const rawLine of source.split(/\r?\n/u)) {
      const tokens = rawLine.trim().split(/\s+/u);
      const type = Number(tokens[0]);
      if (type === 0 && tokens[1]?.toLocaleUpperCase() === "BFC") {
        continue;
      }
      if (type !== 1) continue;
      const childName = tokens[14];
      if (childName === undefined) continue;
      const local: AffineTransform = {
        translation: { x: Number(tokens[2]), y: Number(tokens[3]), z: Number(tokens[4]) },
        matrix: [
          Number(tokens[5]), Number(tokens[6]), Number(tokens[7]),
          Number(tokens[8]), Number(tokens[9]), Number(tokens[10]),
          Number(tokens[11]), Number(tokens[12]), Number(tokens[13])
        ]
      };
      const composed = compose(parent, local);
      references.push({ fileName: childName, position: { ...composed.translation }, matrix: [...composed.matrix] });
      visit(childName, composed, depth + 1);
    }
    stack.delete(key);
  };

  visit(fileName, IDENTITY, 0);
  return references;
};

export const createMapLDrawLibrary = (files: Record<string, string>): LDrawLibrary => {
  const normalized = new Map<string, string>();
  for (const [name, source] of Object.entries(files)) {
    const normalizedName = normalizeFileName(name);
    normalized.set(normalizedName, source);
    const baseName = normalizedName.split("/").pop();
    if (baseName !== undefined && !normalized.has(baseName)) normalized.set(baseName, source);
  }
  return { get: (fileName) => {
    const normalizedName = normalizeFileName(fileName);
    return normalized.get(normalizedName) ?? normalized.get(normalizedName.split("/").pop() ?? normalizedName);
  } };
};

const normalizeFileName = (value: string): string => value.replaceAll("\\", "/").replace(/^\.\//u, "").toLocaleLowerCase();

const determinant = (matrix: AffineTransform["matrix"]): number =>
  matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7]) -
  matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6]) +
  matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6]);

const xor = (a: boolean, b: boolean): boolean => a !== b;

const applyTransform = (transform: AffineTransform, point: LDrawPoint): LDrawPoint => ({
  x: transform.translation.x + transform.matrix[0] * point.x + transform.matrix[1] * point.y + transform.matrix[2] * point.z,
  y: transform.translation.y + transform.matrix[3] * point.x + transform.matrix[4] * point.y + transform.matrix[5] * point.z,
  z: transform.translation.z + transform.matrix[6] * point.x + transform.matrix[7] * point.y + transform.matrix[8] * point.z
});

const compose = (parent: AffineTransform, local: AffineTransform): AffineTransform => ({
  translation: applyTransform(parent, local.translation),
  matrix: [
    parent.matrix[0] * local.matrix[0] + parent.matrix[1] * local.matrix[3] + parent.matrix[2] * local.matrix[6],
    parent.matrix[0] * local.matrix[1] + parent.matrix[1] * local.matrix[4] + parent.matrix[2] * local.matrix[7],
    parent.matrix[0] * local.matrix[2] + parent.matrix[1] * local.matrix[5] + parent.matrix[2] * local.matrix[8],
    parent.matrix[3] * local.matrix[0] + parent.matrix[4] * local.matrix[3] + parent.matrix[5] * local.matrix[6],
    parent.matrix[3] * local.matrix[1] + parent.matrix[4] * local.matrix[4] + parent.matrix[5] * local.matrix[7],
    parent.matrix[3] * local.matrix[2] + parent.matrix[4] * local.matrix[5] + parent.matrix[5] * local.matrix[8],
    parent.matrix[6] * local.matrix[0] + parent.matrix[7] * local.matrix[3] + parent.matrix[8] * local.matrix[6],
    parent.matrix[6] * local.matrix[1] + parent.matrix[7] * local.matrix[4] + parent.matrix[8] * local.matrix[7],
    parent.matrix[6] * local.matrix[2] + parent.matrix[7] * local.matrix[5] + parent.matrix[8] * local.matrix[8]
  ]
});
