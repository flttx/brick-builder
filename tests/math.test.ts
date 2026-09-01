import { describe, expect, it } from "vitest";
import {
  add,
  angleBetweenVectors,
  compose,
  distance,
  fromAxisAngle,
  inverseTransformPoint,
  inverseTransform,
  normalizeQuat,
  quat,
  rotateVector,
  transformPoint,
  vec3,
  yRotationQuarter
} from "../src/index.js";

describe("math foundation", () => {
  it("supports vector operations including negative coordinates", () => {
    expect(add(vec3(-2, 3, -4), vec3(1, -5, 2))).toEqual({ x: -1, y: -2, z: -2 });
    expect(distance(vec3(-1, 0, 0), vec3(2, 0, 0))).toBe(3);
    expect(angleBetweenVectors(vec3(1, 0, 0), vec3(0, 1, 0))).toBeCloseTo(Math.PI / 2);
  });

  it("rotates vectors by Y quarter turns", () => {
    const xAxis = vec3(1, 0, 0);
    expect(rotateVector(yRotationQuarter(0), xAxis).x).toBeCloseTo(1);
    expect(rotateVector(yRotationQuarter(1), xAxis)).toMatchObject({ x: expect.closeTo(0), y: expect.closeTo(0), z: expect.closeTo(-1) });
    expect(rotateVector(yRotationQuarter(2), xAxis)).toMatchObject({ x: expect.closeTo(-1), y: expect.closeTo(0), z: expect.closeTo(0) });
    expect(rotateVector(yRotationQuarter(3), xAxis)).toMatchObject({ x: expect.closeTo(0), y: expect.closeTo(0), z: expect.closeTo(1) });
  });

  it("normalizes and inverts quaternions", () => {
    const rotation = fromAxisAngle(vec3(0, 1, 0), Math.PI / 2);
    const product = normalizeQuat({ ...quat(0, 0, 0, 1), ...rotation });
    expect(product.w).toBeCloseTo(Math.cos(Math.PI / 4));
    expect(rotateVector(inverseTransform({ position: vec3(), rotation }).rotation, rotateVector(rotation, vec3(1, 0, 0)))).toEqual({ x: 1, y: 0, z: 0 });
  });

  it("round trips points through composed transforms", () => {
    const transform = compose(
      { position: vec3(3, -2, 1), rotation: yRotationQuarter(1) },
      { position: vec3(-1, 2, 0.5), rotation: yRotationQuarter(2) }
    );
    const point = vec3(-4, 5, -6);
    const world = transformPoint(transform, point);
    const roundTrip = inverseTransformPoint(transform, world);
    expect(roundTrip.x).toBeCloseTo(-4);
    expect(roundTrip.y).toBeCloseTo(5);
    expect(roundTrip.z).toBeCloseTo(-6);
  });
});
