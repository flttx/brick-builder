import type { NormalizedGeometry } from "./asset-types.js";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;

export const createGlb = (geometry: NormalizedGeometry): Buffer => {
  const positions = Buffer.from(new Float32Array(geometry.positions).buffer);
  const normals = Buffer.from(new Float32Array(geometry.normals).buffer);
  const indices = Buffer.from(new Uint32Array(geometry.indices).buffer);
  const positionOffset = 0;
  const normalOffset = align4(positions.byteLength);
  const indexOffset = normalOffset + align4(normals.byteLength);
  const binary = Buffer.alloc(indexOffset + align4(indices.byteLength));
  positions.copy(binary, positionOffset);
  normals.copy(binary, normalOffset);
  indices.copy(binary, indexOffset);
  const json = JSON.stringify({
    asset: { version: "2.0", generator: "Brick Builder Asset Pipeline" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, mode: 4 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.04, roughnessFactor: 0.42 } }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: positionOffset, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: normalOffset, byteLength: normals.byteLength, target: 34962 },
      { buffer: 0, byteOffset: indexOffset, byteLength: indices.byteLength, target: 34963 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: geometry.positions.length / 3, type: "VEC3", min: geometry.bounds.min, max: geometry.bounds.max },
      { bufferView: 1, componentType: 5126, count: geometry.normals.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5125, count: geometry.indices.length, type: "SCALAR", min: [0], max: [Math.max(0, geometry.positions.length / 3 - 1)] }
    ]
  });
  const jsonChunk = Buffer.from(json.padEnd(align4(Buffer.byteLength(json)), " "));
  const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonChunk.byteLength, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binary.byteLength, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  const header = Buffer.alloc(12); header.writeUInt32LE(GLB_MAGIC, 0); header.writeUInt32LE(GLB_VERSION, 4); header.writeUInt32LE(12 + jsonHeader.byteLength + jsonChunk.byteLength + binHeader.byteLength + binary.byteLength, 8);
  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binary]);
};

export const readGlbJson = (input: Buffer): Record<string, unknown> => {
  if (input.readUInt32LE(0) !== GLB_MAGIC || input.readUInt32LE(4) !== GLB_VERSION) throw new Error("Invalid GLB header");
  const jsonLength = input.readUInt32LE(12);
  return JSON.parse(input.subarray(20, 20 + jsonLength).toString("utf8")) as Record<string, unknown>;
};

const align4 = (value: number): number => (value + 3) & ~3;
