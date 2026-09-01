export type ConnectionType = "rigid";

export interface ConnectionPairReference {
  connectorA: string;
  connectorB: string;
}

export interface ConnectionGroup {
  id: string;
  brickA: string;
  brickB: string;
  type: ConnectionType;
  pairs: ConnectionPairReference[];
}
