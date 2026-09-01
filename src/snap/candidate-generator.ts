import { angleBetweenVectors } from "../math/quat.js";
import { cloneTransform, GROUND_LEVEL, transformPoint, transformDirection } from "../math/transform.js";
import { distance } from "../math/vec3.js";
import { connectorKey, type ConnectorPair, type WorldConnector } from "../connectors/connector.js";
import { isQuarterYRotation, transformKey } from "../math/quantize.js";
import type { BrickInstance } from "../parts/brick-instance.js";
import type { ConnectorDefinition } from "../connectors/connector.js";
import type { Transform } from "../math/transform.js";
import type { Vec3 } from "../math/vec3.js";
import type { ExplicitSnapRequest, ExplicitSnapResult, PrecisionSnapRequest, PrecisionSnapResult, SnapCandidate, SnapContext } from "./snap-types.js";
import type { SnapConfig } from "./snap-config.js";
import { solveSnapTransform } from "./transform-solver.js";
import { solvePrecisionTransform } from "./precision-transform-solver.js";

export const generateSnapCandidates = (
  context: SnapContext,
  request: { movingBrickId: string; freeTransform: Transform; pointerWorld?: Vec3; previousCandidate?: SnapCandidate },
  config: SnapConfig
): SnapCandidate[] => {
  const movingBrick = context.bricks.get(request.movingBrickId);
  const part = context.parts.get(movingBrick.partId);
  const movingConnectors = context.connectors.getWorldConnectors(movingBrick, part, request.freeTransform);
  const deduped = new Map<string, SnapCandidate>();

  for (const movingConnector of movingConnectors) {
    const nearby = context.spatial.query(movingConnector.worldPosition, config.detectRadius, movingBrick.id);
    for (const targetConnector of nearby) {
      const rule = context.connectors.compatibility.getRule(movingConnector.type, targetConnector.type);
      if (rule === undefined || !rule.allow || !sameCompatibilityGroup(movingConnector, targetConnector)) {
        continue;
      }
      if (distance(movingConnector.worldPosition, targetConnector.worldPosition) > rule.maxDistance) {
        continue;
      }
      if (!context.occupancy.canOccupy(targetConnector, "pending") || !canOccupyMoving(context, movingConnector)) {
        continue;
      }
      const transform = solveSnapTransform({
        movingConnector,
        targetConnector,
        currentRotation: request.freeTransform.rotation,
        compatibility: rule,
        rotationEpsilon: config.angleEpsilon
      });
      if (transform === null) {
        continue;
      }
      const candidate = buildCandidate(context, movingBrick, part.connectors, transform, movingConnector.id, targetConnector, request, config);
      const key = `${candidate.targetBrickId}:${transformKey(candidate.transform, config.dedupPositionQuantum)}`;
      const existing = deduped.get(key);
      if (existing === undefined || candidate.score > existing.score) {
        deduped.set(key, candidate);
      }
    }
  }
  return [...deduped.values()].sort((a, b) => b.score - a.score);
};

export const generateExplicitSnap = (
  context: SnapContext,
  request: ExplicitSnapRequest,
  config: SnapConfig
): ExplicitSnapResult => {
  const movingBrick = context.bricks.get(request.movingBrickId);
  const movingPart = context.parts.get(movingBrick.partId);
  const targetBrick = context.bricks.get(request.targetBrickId);
  const targetPart = context.parts.get(targetBrick.partId);
  const collisionAtFreeTransform = context.collision.checkBrick(movingBrick, request.freeTransform);
  const movingConnector = context.connectors.getWorldConnector(movingBrick, movingPart, request.movingConnectorId, request.freeTransform);
  const targetConnector = context.connectors.getWorldConnector(targetBrick, targetPart, request.targetConnectorId);

  if (movingBrick.id === targetBrick.id) {
    return {
      valid: false,
      matchedPairs: [],
      collision: collisionAtFreeTransform,
      reason: "connector_incompatible"
    };
  }

  const rule = context.connectors.compatibility.getRule(movingConnector.type, targetConnector.type);
  if (
    rule === undefined ||
    !rule.allow ||
    !sameCompatibilityGroup(movingConnector, targetConnector) ||
    !context.occupancy.canOccupy(movingConnector, "pending") ||
    !context.occupancy.canOccupy(targetConnector, "pending")
  ) {
    return {
      valid: false,
      matchedPairs: [],
      collision: collisionAtFreeTransform,
      reason: rule === undefined || !rule.allow || !sameCompatibilityGroup(movingConnector, targetConnector)
        ? "connector_incompatible"
        : "connector_occupied"
    };
  }

  const transform = solveSnapTransform({
    movingConnector,
    targetConnector,
    currentRotation: request.freeTransform.rotation,
    compatibility: rule,
    rotationEpsilon: config.angleEpsilon
  });
  if (transform === null) {
    return {
      valid: false,
      matchedPairs: [],
      collision: collisionAtFreeTransform,
      reason: isQuarterYRotation(request.freeTransform.rotation, config.angleEpsilon)
        ? "connector_incompatible"
        : "invalid_rotation"
    };
  }

  const matchedPairs = findMatchedPairs(
    context,
    movingPart.connectors.map((connector) => toWorldConnector(movingBrick, connector, transform)),
    targetBrick.id,
    config,
    { movingConnectorId: request.movingConnectorId, targetConnector }
  );
  const candidate = buildCandidate(
    context,
    movingBrick,
    movingPart.connectors,
    transform,
    request.movingConnectorId,
    targetConnector,
    request,
    config,
    matchedPairs
  );
  const collision = candidate.collision;
  return {
    valid: collision.valid,
    transform: cloneTransform(transform),
    matchedPairs,
    collision,
    ...(collision.valid ? { candidate } : {}),
    ...(collision.valid ? {} : { reason: "collision" as const })
  };
};

export const generatePrecisionSnap = (
  context: SnapContext,
  request: PrecisionSnapRequest,
  config: SnapConfig
): PrecisionSnapResult => {
  const movingBrick = context.bricks.get(request.movingBrickId);
  const movingPart = context.parts.get(movingBrick.partId);
  const targetBrick = context.bricks.get(request.targetBrickId);
  const targetPart = context.parts.get(targetBrick.partId);
  const collisionAtFreeTransform = context.collision.checkBrick(movingBrick, request.freeTransform);
  if (movingBrick.id === targetBrick.id || request.movingConnectorA1Id === request.movingConnectorA2Id || request.targetConnectorB1Id === request.targetConnectorB2Id) {
    return { valid: false, matchedPairs: [], collision: collisionAtFreeTransform, reason: "duplicate_connector" };
  }
  const movingA1 = movingPart.connectors.find((connector) => connector.id === request.movingConnectorA1Id);
  const movingA2 = movingPart.connectors.find((connector) => connector.id === request.movingConnectorA2Id);
  const targetB1 = context.connectors.getWorldConnector(targetBrick, targetPart, request.targetConnectorB1Id);
  const targetB2 = context.connectors.getWorldConnector(targetBrick, targetPart, request.targetConnectorB2Id);
  if (movingA1 === undefined || movingA2 === undefined) {
    return { valid: false, matchedPairs: [], collision: collisionAtFreeTransform, reason: "connector_incompatible" };
  }
  const sourceDistance = distance(movingA1.position, movingA2.position);
  const targetDistance = distance(targetB1.worldPosition, targetB2.worldPosition);
  if (Math.abs(sourceDistance - targetDistance) > config.positionEpsilon) {
    return { valid: false, matchedPairs: [], collision: collisionAtFreeTransform, reason: "distance_mismatch" };
  }
  const movingWorldA1 = toWorldConnector(movingBrick, movingA1, request.freeTransform);
  const movingWorldA2 = toWorldConnector(movingBrick, movingA2, request.freeTransform);
  if (!context.occupancy.canOccupy(movingWorldA1, "pending") || !context.occupancy.canOccupy(movingWorldA2, "pending")) {
    return { valid: false, matchedPairs: [], collision: collisionAtFreeTransform, reason: "connector_occupied" };
  }
  const rules = [
    context.connectors.compatibility.getRule(movingA1.type, targetB1.type),
    context.connectors.compatibility.getRule(movingA2.type, targetB2.type)
  ];
  if (
    movingA1.type === targetB1.type ||
    movingA2.type === targetB2.type ||
    rules.some((rule) => rule === undefined || !rule.allow) ||
    !sameCompatibilityGroup(movingA1, targetB1) ||
    !sameCompatibilityGroup(movingA2, targetB2)
  ) {
    return { valid: false, matchedPairs: [], collision: collisionAtFreeTransform, reason: "connector_incompatible" };
  }
  if (!context.occupancy.canOccupy(targetB1, "pending") || !context.occupancy.canOccupy(targetB2, "pending")) {
    return { valid: false, matchedPairs: [], collision: collisionAtFreeTransform, reason: "connector_occupied" };
  }
  const transform = solvePrecisionTransform({ movingA1, movingA2, targetB1, targetB2 });
  if (transform === null) {
    return { valid: false, matchedPairs: [], collision: collisionAtFreeTransform, reason: "invalid_rotation" };
  }
  if (transform.position.y < GROUND_LEVEL - config.positionEpsilon) {
    return { valid: false, matchedPairs: [], collision: collisionAtFreeTransform, reason: "below_ground" };
  }
  const transformedMoving = movingPart.connectors.map((connector) => toWorldConnector(movingBrick, connector, transform));
  const matchedPairs = findMatchedPairs(
    context,
    transformedMoving,
    targetBrick.id,
    config,
    { movingConnectorId: request.movingConnectorA1Id, targetConnector: targetB1 }
  );
  const secondMoving = transformedMoving.find((connector) => connector.id === request.movingConnectorA2Id);
  if (secondMoving === undefined || !context.connectors.compatibility.areCompatible(secondMoving, targetB2, config.positionEpsilon)) {
    return { valid: false, matchedPairs: [], collision: collisionAtFreeTransform, reason: "connector_incompatible" };
  }
  if (!matchedPairs.some((pair) => pair.moving.id === secondMoving.id && pair.target.id === targetB2.id)) {
    matchedPairs.push({ moving: secondMoving, target: targetB2 });
  }
  const candidate = buildCandidate(
    context,
    movingBrick,
    movingPart.connectors,
    transform,
    request.movingConnectorA1Id,
    targetB1,
    request,
    config,
    matchedPairs
  );
  return {
    valid: candidate.collision.valid,
    transform: cloneTransform(transform),
    matchedPairs,
    collision: candidate.collision,
    ...(candidate.collision.valid ? { candidate } : {}),
    ...(candidate.collision.valid ? {} : { reason: "collision" as const })
  };
};

const buildCandidate = (
  context: SnapContext,
  movingBrick: BrickInstance,
  localConnectors: ConnectorDefinition[],
  transform: Transform,
  movingAnchorId: string,
  targetAnchor: WorldConnector,
  request: { movingBrickId: string; freeTransform: Transform; pointerWorld?: Vec3; previousCandidate?: SnapCandidate },
  config: SnapConfig,
  matchedPairs?: ConnectorPair[]
): SnapCandidate => {
  const transformedMoving = localConnectors.map((connector) => toWorldConnector(movingBrick, connector, transform));
  const resolvedPairs = matchedPairs ?? findMatchedPairs(context, transformedMoving, targetAnchor.brickId, config);
  const anchorMoving = transformedMoving.find((connector) => connector.id === movingAnchorId) ?? transformedMoving[0];
  if (anchorMoving === undefined) {
    throw new Error("A part must contain at least one connector");
  }
  const pointerDistance = request.pointerWorld === undefined ? undefined : distance(request.pointerWorld, targetAnchor.worldPosition);
  const distanceError = distance(
    transformPoint(request.freeTransform, localConnectors.find((connector) => connector.id === movingAnchorId)?.position ?? anchorMoving.position),
    targetAnchor.worldPosition
  );
  const rotationError = angleBetweenVectors(anchorMoving.worldNormal, {
    x: -targetAnchor.worldNormal.x,
    y: -targetAnchor.worldNormal.y,
    z: -targetAnchor.worldNormal.z
  });
  const stable = request.previousCandidate !== undefined &&
    request.previousCandidate.targetBrickId === targetAnchor.brickId &&
    transformKey(request.previousCandidate.transform, config.dedupPositionQuantum) === transformKey(transform, config.dedupPositionQuantum);
  const collision = context.collision.checkBrick(movingBrick, transform);
  const score =
    resolvedPairs.length * config.connectionCountWeight -
    distanceError * config.distanceWeight -
    rotationError * config.rotationWeight -
    (pointerDistance ?? 0) * config.pointerWeight +
    (stable ? config.previousCandidateBonus : 0);
  return {
    id: `${movingBrick.id}->${targetAnchor.brickId}:${movingAnchorId}->${targetAnchor.id}:${transformKey(transform, config.dedupPositionQuantum)}`,
    movingBrickId: movingBrick.id,
    targetBrickId: targetAnchor.brickId,
    anchorPair: { moving: anchorMoving, target: targetAnchor },
    matchedPairs: resolvedPairs,
    transform: cloneTransform(transform),
    score,
    distance: distanceError,
    rotationError,
    ...(pointerDistance === undefined ? {} : { pointerDistance }),
    collision,
    stable
  };
};

const findMatchedPairs = (
  context: SnapContext,
  movingConnectors: WorldConnector[],
  targetBrickId: string,
  config: SnapConfig,
  requiredPair?: { movingConnectorId: string; targetConnector: WorldConnector }
): ConnectorPair[] => {
  const usedTargets = new Set<string>();
  const pairs: ConnectorPair[] = [];
  if (requiredPair !== undefined) {
    const moving = movingConnectors.find((connector) => connector.id === requiredPair.movingConnectorId);
    if (
      moving !== undefined &&
      requiredPair.targetConnector.brickId === targetBrickId &&
      context.connectors.compatibility.areCompatible(moving, requiredPair.targetConnector, distance(moving.worldPosition, requiredPair.targetConnector.worldPosition)) &&
      context.occupancy.canOccupy(moving, "pending") &&
      context.occupancy.canOccupy(requiredPair.targetConnector, "pending")
    ) {
      usedTargets.add(connectorKey(requiredPair.targetConnector.brickId, requiredPair.targetConnector.id));
      pairs.push({ moving, target: requiredPair.targetConnector });
    }
  }
  for (const moving of movingConnectors) {
    if (moving.id === requiredPair?.movingConnectorId) {
      continue;
    }
    const targets = context.spatial.query(moving.worldPosition, config.positionEpsilon, moving.brickId)
      .filter((target) => target.brickId === targetBrickId)
      .filter((target) => !usedTargets.has(connectorKey(target.brickId, target.id)))
      .filter((target) => context.connectors.compatibility.areCompatible(moving, target, distance(moving.worldPosition, target.worldPosition)))
      .filter((target) => angleBetweenVectors(moving.worldNormal, {
        x: -target.worldNormal.x,
        y: -target.worldNormal.y,
        z: -target.worldNormal.z
      }) <= config.angleEpsilon)
      .filter((target) => context.occupancy.canOccupy(target, "pending"));
    const target = targets.sort((a, b) => distance(moving.worldPosition, a.worldPosition) - distance(moving.worldPosition, b.worldPosition))[0];
    if (target !== undefined) {
      usedTargets.add(connectorKey(target.brickId, target.id));
      pairs.push({ moving, target });
    }
  }
  return pairs;
};

const canOccupyMoving = (context: SnapContext, connector: WorldConnector): boolean =>
  context.occupancy.getGroupIds(connector.brickId, connector.id).length === 0;

const sameCompatibilityGroup = (a: ConnectorDefinition, b: ConnectorDefinition): boolean =>
  a.compatibilityGroup === b.compatibilityGroup || a.compatibilityGroup === "*" || b.compatibilityGroup === "*";

const toWorldConnector = (brick: BrickInstance, connector: ConnectorDefinition, transform: Transform): WorldConnector => ({
  ...connector,
  position: { ...connector.position },
  rotation: { ...connector.rotation },
  normal: { ...connector.normal },
  brickId: brick.id,
  partId: brick.partId,
  worldPosition: transformPoint(transform, connector.position),
  worldRotation: transform.rotation,
  worldNormal: transformDirection(transform, connector.normal)
});
