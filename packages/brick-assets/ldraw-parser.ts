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

interface AffineTransform {
  translation: LDrawPoint;
  matrix: [number, number, number, number, number, number, number, number, number];
}

const IDENTITY: AffineTransform = {
  translation: { x: 0, y: 0, z: 0 },
  matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1]
};

export const parseLDrawPart = (fileName: string, library: LDrawLibrary, maxDepth = 32): LDrawMesh => {
  const positions: number[] = [];
  const indices: number[] = [];
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
        indices.push(start, start + 1, start + 2);
        if (pointCount === 4) indices.push(start, start + 2, start + 3);
      } else if (type === 1) {
        const childName = tokens[14];
        if (childName !== undefined) {
          visit(childName, compose(parent, {
            translation: { x: Number(tokens[2]), y: Number(tokens[3]), z: Number(tokens[4]) },
            matrix: [
              Number(tokens[5]), Number(tokens[6]), Number(tokens[7]),
              Number(tokens[8]), Number(tokens[9]), Number(tokens[10]),
              Number(tokens[11]), Number(tokens[12]), Number(tokens[13])
            ]
          }), depth + 1);
        }
      }
    }
    stack.delete(key);
  };

  visit(fileName, IDENTITY, 0);
  return { positions, indices };
};

export const createMapLDrawLibrary = (files: Record<string, string>): LDrawLibrary => {
  const normalized = new Map(Object.entries(files).map(([name, source]) => [name.toLocaleLowerCase(), source]));
  return { get: (fileName) => normalized.get(fileName.toLocaleLowerCase()) ?? normalized.get(fileName.split("/").pop()?.toLocaleLowerCase() ?? fileName.toLocaleLowerCase()) };
};

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
