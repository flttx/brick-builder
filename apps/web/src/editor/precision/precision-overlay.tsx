import { Html, Line } from "@react-three/drei";
import type { ReactElement } from "react";
import type { BrickEngine, ExplicitSnapRequest, ExplicitSnapResult, WorldConnector } from "../../../../../src/index.js";
import type { PrecisionInteractionState } from "../interaction/interaction-controller.js";
import { localizeConnectorType, messages } from "../../i18n/index.js";

export interface PrecisionPreviewState {
  request: ExplicitSnapRequest;
  result: ExplicitSnapResult;
}

export interface PrecisionOverlayProps {
  engine: BrickEngine;
  movingBrickId: string;
  state: PrecisionInteractionState;
  sourceConnectorId?: string;
  targetConnectorId?: string;
  preview?: PrecisionPreviewState;
  onSourceConnector: (connectorId: string) => void;
  onTargetConnector: (connectorId: string, brickId: string) => void;
}

export const PrecisionOverlay = (props: PrecisionOverlayProps): ReactElement | null => {
  const movingBrick = props.engine.bricks.tryGet(props.movingBrickId);
  if (movingBrick === undefined) {
    return null;
  }
  const movingPart = props.engine.parts.get(movingBrick.partId);
  const movingTransform = props.preview?.result.transform ?? movingBrick.transform;
  const movingConnectors = props.engine.connectors.getWorldConnectors(movingBrick, movingPart, movingTransform);
  const selectedSource = props.sourceConnectorId === undefined
    ? undefined
    : movingConnectors.find((connector) => connector.id === props.sourceConnectorId);
  const selectedTarget = props.targetConnectorId === undefined || props.preview?.request.targetBrickId === undefined
    ? undefined
    : getWorldConnector(props.engine, props.preview.request.targetBrickId, props.targetConnectorId);
  const sourceConnectors = props.state === "precision_pick_source"
    ? movingConnectors.filter((connector) => !props.engine.occupancy.isOccupied(connector.brickId, connector.id))
    : selectedSource === undefined ? [] : [selectedSource];
  const targetConnectors = props.state === "precision_pick_target" && selectedSource !== undefined
    ? targetConnectorsFor(props.engine, selectedSource, movingBrick.id)
    : selectedTarget === undefined ? [] : [selectedTarget];

  return (
    <>
      {sourceConnectors.map((connector) => (
        <ConnectorMarker
          key={`source-${connector.id}`}
          connector={connector}
          kind="source"
          onClick={props.onSourceConnector}
        />
      ))}
      {targetConnectors.map((connector) => (
        <ConnectorMarker
          key={`target-${connector.brickId}-${connector.id}`}
          connector={connector}
          kind="target"
          onClick={(connectorId) => props.onTargetConnector(connectorId, connector.brickId)}
        />
      ))}
      {selectedSource !== undefined && selectedTarget !== undefined && props.state === "precision_preview" && (
        <Line
          points={[toPoint(selectedSource.worldPosition), toPoint(selectedTarget.worldPosition)]}
          color="#f6c453"
          lineWidth={2}
        />
      )}
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

const targetConnectorsFor = (engine: BrickEngine, source: WorldConnector, movingBrickId: string): WorldConnector[] => {
  return engine.spatial
    .query(source.worldPosition, engine.snap.config.detectRadius * 1.5, movingBrickId)
    .filter((target) => {
      const rule = engine.connectors.compatibility.getRule(source.type, target.type);
      const sameGroup = source.compatibilityGroup === target.compatibilityGroup || source.compatibilityGroup === "*" || target.compatibilityGroup === "*";
      return rule !== undefined && rule.allow && sameGroup;
    })
    .filter((target) => {
      return !engine.occupancy.isOccupied(target.brickId, target.id);
    })
    .filter((target) => {
      const rule = engine.connectors.compatibility.getRule(source.type, target.type);
      return rule !== undefined && distanceBetween(source, target) <= rule.maxDistance;
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
