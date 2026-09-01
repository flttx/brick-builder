import { Html, Line } from "@react-three/drei";
import type { ReactElement } from "react";
import { GROUND_LEVEL, solveSnapTransform } from "../../../../../src/index.js";
import type { BrickEngine, PrecisionSnapRequest, PrecisionSnapResult, WorldConnector } from "../../../../../src/index.js";
import type { PrecisionInteractionState } from "../interaction/interaction-controller.js";
import { localizeConnectorType, messages } from "../../i18n/index.js";

export interface PrecisionPreviewState {
  request: PrecisionSnapRequest;
  result: PrecisionSnapResult;
}

export interface PrecisionOverlayProps {
  engine: BrickEngine;
  movingBrickId: string;
  state: PrecisionInteractionState;
  sourceConnectorA1Id?: string;
  sourceConnectorA2Id?: string;
  targetConnectorB1Id?: string;
  targetConnectorB2Id?: string;
  targetBrickId?: string;
  preview?: PrecisionPreviewState;
  onSourceConnectorA1: (connectorId: string) => void;
  onSourceConnectorA2: (connectorId: string) => void;
  onTargetConnectorB1: (connectorId: string, brickId: string) => void;
  onTargetConnectorB2: (connectorId: string, brickId: string) => void;
}

export const PrecisionOverlay = (props: PrecisionOverlayProps): ReactElement | null => {
  const movingBrick = props.engine.bricks.tryGet(props.movingBrickId);
  if (movingBrick === undefined) {
    return null;
  }
  const movingPart = props.engine.parts.get(movingBrick.partId);
  const movingTransform = props.preview?.result.transform ?? movingBrick.transform;
  const movingConnectors = props.engine.connectors.getWorldConnectors(movingBrick, movingPart, movingTransform);
  const selectedSourceA1 = props.sourceConnectorA1Id === undefined
    ? undefined
    : movingConnectors.find((connector) => connector.id === props.sourceConnectorA1Id);
  const selectedSourceA2 = props.sourceConnectorA2Id === undefined
    ? undefined
    : movingConnectors.find((connector) => connector.id === props.sourceConnectorA2Id);
  const selectedTargetB1 = props.targetConnectorB1Id === undefined || props.targetBrickId === undefined
    ? undefined
    : getWorldConnector(props.engine, props.targetBrickId, props.targetConnectorB1Id);
  const selectedTargetB2 = props.targetConnectorB2Id === undefined || props.targetBrickId === undefined
    ? undefined
    : getWorldConnector(props.engine, props.targetBrickId, props.targetConnectorB2Id);
  const sourceConnectors = props.state === "precision_pick_source_a1"
    ? movingConnectors.filter((connector) => !props.engine.occupancy.isOccupied(connector.brickId, connector.id))
    : props.state === "precision_pick_source_a2"
      ? movingConnectors.filter((connector) => connector.id !== props.sourceConnectorA1Id && !props.engine.occupancy.isOccupied(connector.brickId, connector.id))
      : selectedSourceA1 === undefined ? [] : [selectedSourceA1];
  const targetConnectors = props.state === "precision_pick_target_b1" && selectedSourceA1 !== undefined
    ? targetConnectorsFor(props.engine, selectedSourceA1, movingBrick.id)
    : props.state === "precision_pick_target_b2" && selectedSourceA2 !== undefined
      ? targetConnectorsFor(props.engine, selectedSourceA2, movingBrick.id, props.targetBrickId).filter((connector) => connector.id !== props.targetConnectorB1Id)
      : selectedTargetB1 === undefined && selectedTargetB2 === undefined ? [] : [selectedTargetB1, selectedTargetB2].filter((connector): connector is WorldConnector => connector !== undefined);

  return (
    <>
      {sourceConnectors.map((connector) => (
        <ConnectorMarker
          key={`source-${connector.id}`}
          connector={connector}
          kind="source"
          onClick={props.state === "precision_pick_source_a1" ? props.onSourceConnectorA1 : props.onSourceConnectorA2}
        />
      ))}
      {targetConnectors.map((connector) => (
        <ConnectorMarker
          key={`target-${connector.brickId}-${connector.id}`}
          connector={connector}
          kind="target"
          onClick={(connectorId) => (props.state === "precision_pick_target_b1" ? props.onTargetConnectorB1 : props.onTargetConnectorB2)(connectorId, connector.brickId)}
        />
      ))}
      {props.state === "precision_preview" && selectedSourceA1 !== undefined && selectedTargetB1 !== undefined && <Line points={[toPoint(selectedSourceA1.worldPosition), toPoint(selectedTargetB1.worldPosition)]} color="#f6c453" lineWidth={2} />}
      {props.state === "precision_preview" && selectedSourceA2 !== undefined && selectedTargetB2 !== undefined && <Line points={[toPoint(selectedSourceA2.worldPosition), toPoint(selectedTargetB2.worldPosition)]} color="#f6c453" lineWidth={2} />}
    </>
  );
};

interface ConnectorMarkerProps {
  connector: WorldConnector;
  kind: "source" | "target";
  onClick: (connectorId: string) => void;
}

const ConnectorMarker = (props: ConnectorMarkerProps): ReactElement => (
  <Html
    position={toPoint(props.connector.worldPosition)}
    center
    zIndexRange={[30, 0]}
    style={{ pointerEvents: "auto" }}
  >
    <button
      type="button"
      className={`precision-connector-marker precision-connector-${props.kind}`}
      aria-label={props.kind === "source" ? messages.editor.placement.precision.sourceAria(localizeConnectorType(props.connector.type), props.connector.id) : messages.editor.placement.precision.targetAria(localizeConnectorType(props.connector.type), props.connector.id)}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick(props.connector.id);
      }}
    >
      <span aria-hidden="true" />
    </button>
  </Html>
);

const targetConnectorsFor = (engine: BrickEngine, source: WorldConnector, movingBrickId: string, targetBrickId?: string): WorldConnector[] => {
  const movingBrick = engine.bricks.tryGet(movingBrickId);
  if (movingBrick === undefined) {
    return [];
  }
  const movingPart = engine.parts.get(movingBrick.partId);
  const movingConnector = movingPart.connectors.find((connector) => connector.id === source.id);
  if (movingConnector === undefined) {
    return [];
  }
  return engine.spatial
    .values()
    .filter((target) => target.brickId !== movingBrickId && (targetBrickId === undefined || target.brickId === targetBrickId))
    .filter((target) => {
      const rule = engine.connectors.compatibility.getRule(source.type, target.type);
      const sameGroup = source.compatibilityGroup === target.compatibilityGroup || source.compatibilityGroup === "*" || target.compatibilityGroup === "*";
      if (source.type === target.type || rule === undefined || !rule.allow || !sameGroup) {
        return false;
      }
      const transform = solveSnapTransform({
        movingConnector,
        targetConnector: target,
        currentRotation: movingBrick.transform.rotation,
        compatibility: rule,
        rotationEpsilon: engine.snap.config.angleEpsilon
      });
      return transform !== null && transform.position.y >= GROUND_LEVEL - engine.snap.config.positionEpsilon;
    })
    .filter((target) => {
      return !engine.occupancy.isOccupied(target.brickId, target.id);
    })
    .sort((a, b) => distanceBetween(source, a) - distanceBetween(source, b));
};

const getWorldConnector = (engine: BrickEngine, brickId: string, connectorId: string): WorldConnector => {
  const brick = engine.bricks.get(brickId);
  return engine.connectors.getWorldConnector(brick, engine.parts.get(brick.partId), connectorId);
};

const distanceBetween = (a: WorldConnector, b: WorldConnector): number => Math.hypot(
  a.worldPosition.x - b.worldPosition.x,
  a.worldPosition.y - b.worldPosition.y,
  a.worldPosition.z - b.worldPosition.z
);

const toPoint = (value: { x: number; y: number; z: number }): [number, number, number] => [value.x, value.y, value.z];
