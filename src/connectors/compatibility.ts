import type { ConnectorDefinition, ConnectorType } from "./connector.js";
import { distance } from "../math/vec3.js";

export type RotationMode = "fixed" | "axis" | "free";

export interface ConnectorCompatibilityRule {
  source: ConnectorType;
  target: ConnectorType;
  allow: boolean;
  maxDistance: number;
  maxAngle: number;
  rotationMode: RotationMode;
}

export const DEFAULT_CONNECTOR_MAX_DISTANCE = 0.55;
export const DEFAULT_CONNECTOR_MAX_ANGLE = Math.PI / 18;

export class ConnectorCompatibilityRegistry {
  private readonly rules = new Map<string, ConnectorCompatibilityRule>();

  public constructor(rules: ConnectorCompatibilityRule[] = defaultCompatibilityRules()) {
    for (const rule of rules) {
      this.setRule(rule);
    }
  }

  public setRule(rule: ConnectorCompatibilityRule): void {
    this.rules.set(this.key(rule.source, rule.target), { ...rule });
  }

  public getRule(source: ConnectorType, target: ConnectorType): ConnectorCompatibilityRule | undefined {
    const direct = this.rules.get(this.key(source, target));
    if (direct !== undefined) {
      return { ...direct };
    }
    const reverse = this.rules.get(this.key(target, source));
    return reverse === undefined ? undefined : { ...reverse, source, target };
  }

  public areCompatible(source: ConnectorDefinition, target: ConnectorDefinition, distanceValue?: number): boolean {
    const rule = this.getRule(source.type, target.type);
    if (rule === undefined || !rule.allow) {
      return false;
    }
    const sameGroup =
      source.compatibilityGroup === target.compatibilityGroup ||
      source.compatibilityGroup === "*" ||
      target.compatibilityGroup === "*";
    return sameGroup && (distanceValue === undefined || distanceValue <= rule.maxDistance);
  }

  private key(source: ConnectorType, target: ConnectorType): string {
    return `${source}->${target}`;
  }
}

export const defaultCompatibilityRules = (): ConnectorCompatibilityRule[] => [
  {
    source: "stud",
    target: "anti_stud",
    allow: true,
    maxDistance: DEFAULT_CONNECTOR_MAX_DISTANCE,
    maxAngle: DEFAULT_CONNECTOR_MAX_ANGLE,
    rotationMode: "fixed"
  },
  {
    source: "anti_stud",
    target: "stud",
    allow: true,
    maxDistance: DEFAULT_CONNECTOR_MAX_DISTANCE,
    maxAngle: DEFAULT_CONNECTOR_MAX_ANGLE,
    rotationMode: "fixed"
  },
  {
    source: "stud",
    target: "stud",
    allow: false,
    maxDistance: DEFAULT_CONNECTOR_MAX_DISTANCE,
    maxAngle: DEFAULT_CONNECTOR_MAX_ANGLE,
    rotationMode: "fixed"
  },
  {
    source: "anti_stud",
    target: "anti_stud",
    allow: false,
    maxDistance: DEFAULT_CONNECTOR_MAX_DISTANCE,
    maxAngle: DEFAULT_CONNECTOR_MAX_ANGLE,
    rotationMode: "fixed"
  },
  {
    source: "technic_pin",
    target: "technic_hole",
    allow: true,
    maxDistance: DEFAULT_CONNECTOR_MAX_DISTANCE,
    maxAngle: DEFAULT_CONNECTOR_MAX_ANGLE,
    rotationMode: "fixed"
  },
  {
    source: "technic_hole",
    target: "technic_pin",
    allow: true,
    maxDistance: DEFAULT_CONNECTOR_MAX_DISTANCE,
    maxAngle: DEFAULT_CONNECTOR_MAX_ANGLE,
    rotationMode: "fixed"
  },
  {
    source: "axle",
    target: "axle_hole",
    allow: true,
    maxDistance: DEFAULT_CONNECTOR_MAX_DISTANCE,
    maxAngle: DEFAULT_CONNECTOR_MAX_ANGLE,
    rotationMode: "fixed"
  },
  {
    source: "axle_hole",
    target: "axle",
    allow: true,
    maxDistance: DEFAULT_CONNECTOR_MAX_DISTANCE,
    maxAngle: DEFAULT_CONNECTOR_MAX_ANGLE,
    rotationMode: "fixed"
  },
  {
    source: "bar",
    target: "clip",
    allow: true,
    maxDistance: DEFAULT_CONNECTOR_MAX_DISTANCE,
    maxAngle: DEFAULT_CONNECTOR_MAX_ANGLE,
    rotationMode: "fixed"
  },
  {
    source: "clip",
    target: "bar",
    allow: true,
    maxDistance: DEFAULT_CONNECTOR_MAX_DISTANCE,
    maxAngle: DEFAULT_CONNECTOR_MAX_ANGLE,
    rotationMode: "fixed"
  }
];

export const connectorPairDistance = (source: ConnectorDefinition, target: ConnectorDefinition): number =>
  distance(source.position, target.position);
