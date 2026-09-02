import { angleBetweenVectors, normalize as normalizeQuat, rotateVector } from "../math/quat.js";
import type { Quat } from "../math/quat.js";
import type { Transform } from "../math/transform.js";
import { transformPoint } from "../math/transform.js";
import type { ConnectorDefinition, WorldConnector } from "../connectors/connector.js";
import type { ConnectorCompatibilityRule } from "../connectors/compatibility.js";
import { isQuarterAxisRotation } from "../math/quantize.js";
import { subtract } from "../math/vec3.js";

export interface SnapTransformInput {
  movingConnector: ConnectorDefinition;
  targetConnector: WorldConnector;
  currentRotation: Quat;
  compatibility: ConnectorCompatibilityRule;
  rotationEpsilon?: number;
}

export const solveSnapTransform = (input: SnapTransformInput): Transform | null => {
  const rotation = normalizeQuat(input.currentRotation);
  const epsilon = input.rotationEpsilon ?? 1e-5;
  if (!isQuarterAxisRotation(rotation, epsilon)) {
    return null;
  }
  const movingNormalWorld = rotateVector(rotation, input.movingConnector.normal);
  const desiredNormal = {
    x: -input.targetConnector.worldNormal.x,
    y: -input.targetConnector.worldNormal.y,
    z: -input.targetConnector.worldNormal.z
  };
  if (angleBetweenVectors(movingNormalWorld, desiredNormal) > input.compatibility.maxAngle) {
    return null;
  }
  const movingConnectorWorldPosition = transformPoint(
    { position: { x: 0, y: 0, z: 0 }, rotation },
    input.movingConnector.position
  );
  return {
    position: subtract(input.targetConnector.worldPosition, movingConnectorWorldPosition),
    rotation
  };
};

export const snapTransformError = (transform: Transform, movingConnector: ConnectorDefinition, target: WorldConnector): number =>
  Math.max(
    Math.hypot(
      transformPoint(transform, movingConnector.position).x - target.worldPosition.x,
      transformPoint(transform, movingConnector.position).y - target.worldPosition.y,
      transformPoint(transform, movingConnector.position).z - target.worldPosition.z
    ),
    angleBetweenVectors(rotateVector(transform.rotation, movingConnector.normal), {
      x: -target.worldNormal.x,
      y: -target.worldNormal.y,
      z: -target.worldNormal.z
    })
  );
