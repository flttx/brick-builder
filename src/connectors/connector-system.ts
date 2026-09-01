import type { BrickInstance } from "../parts/brick-instance.js";
import type { PartDefinition } from "../parts/part-definition.js";
import { transformDirection, transformPoint } from "../math/transform.js";
import type { Transform } from "../math/transform.js";
import type { Quat } from "../math/quat.js";
import type { Vec3 } from "../math/vec3.js";
import { normalize } from "../math/vec3.js";
import type { ConnectorDefinition, WorldConnector } from "./connector.js";
import { ConnectorCompatibilityRegistry } from "./compatibility.js";

export class ConnectorSystem {
  public constructor(public readonly compatibility: ConnectorCompatibilityRegistry = new ConnectorCompatibilityRegistry()) {}

  public getLocalConnectors(part: PartDefinition): ConnectorDefinition[] {
    return part.connectors.map((connector) => this.cloneDefinition(connector));
  }

  public getWorldConnectors(brick: BrickInstance, part: PartDefinition, transform: Transform = brick.transform): WorldConnector[] {
    return part.connectors.map((connector) => this.toWorldConnector(brick, connector, transform));
  }

  public getWorldConnector(
    brick: BrickInstance,
    part: PartDefinition,
    connectorId: string,
    transform: Transform = brick.transform
  ): WorldConnector {
    const connector = part.connectors.find((candidate) => candidate.id === connectorId);
    if (connector === undefined) {
      throw new Error(`Connector ${connectorId} does not exist on part ${part.id}`);
    }
    return this.toWorldConnector(brick, connector, transform);
  }

  private toWorldConnector(brick: BrickInstance, connector: ConnectorDefinition, transform: Transform): WorldConnector {
    const worldRotation = multiplyRotation(transform.rotation, connector.rotation);
    return {
      ...this.cloneDefinition(connector),
      brickId: brick.id,
      partId: brick.partId,
      worldPosition: transformPoint(transform, connector.position),
      worldRotation,
      worldNormal: normalize(transformDirection(transform, connector.normal))
    };
  }

  private cloneDefinition(connector: ConnectorDefinition): ConnectorDefinition {
    return {
      ...connector,
      position: { ...connector.position },
      rotation: { ...connector.rotation },
      normal: { ...connector.normal }
    };
  }
}

const multiplyRotation = (a: Quat, b: Quat): Quat => {
  const result = {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  };
  const magnitude = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2 + result.w ** 2);
  return magnitude === 0 ? { x: 0, y: 0, z: 0, w: 1 } : {
    x: result.x / magnitude,
    y: result.y / magnitude,
    z: result.z / magnitude,
    w: result.w / magnitude
  };
};

export const connectorWorldPosition = (connector: WorldConnector): Vec3 => ({ ...connector.worldPosition });
