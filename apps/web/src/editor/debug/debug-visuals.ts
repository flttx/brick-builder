import * as THREE from "three";
import type { BrickEngine, SnapCandidate } from "../../../../../src/index.js";

export interface DebugFlags {
  connectors: boolean;
  colliders: boolean;
  candidate: boolean;
  connections: boolean;
  dragPlane: boolean;
}

export const DEFAULT_DEBUG_FLAGS: DebugFlags = { connectors: false, colliders: false, candidate: true, connections: true, dragPlane: false };

export class DebugVisuals {
  private readonly root = new THREE.Group();
  private readonly connectorGroup = new THREE.Group();
  private readonly colliderGroup = new THREE.Group();
  private readonly candidateGroup = new THREE.Group();
  private readonly connectionGroup = new THREE.Group();
  private readonly dragPlaneGroup = new THREE.Group();
  private readonly connectorMarkers: Array<{ marker: THREE.Mesh; arrow: THREE.ArrowHelper }> = [];
  private readonly colliderHelpers: THREE.Box3Helper[] = [];
  private readonly connectionLines: THREE.Line[] = [];
  private readonly candidateLine: THREE.Line;
  private readonly candidateMarker: THREE.Mesh;
  private flags: DebugFlags = { ...DEFAULT_DEBUG_FLAGS };
  private planeHelper: THREE.PlaneHelper | undefined;
  private candidate: SnapCandidate | undefined;
  private dragPlane: THREE.Plane | undefined;

  public constructor(private readonly scene: THREE.Scene, private readonly engine: BrickEngine) {
    this.root.name = "brick-builder-debug";
    this.root.add(this.connectorGroup, this.colliderGroup, this.candidateGroup, this.connectionGroup, this.dragPlaneGroup);
    this.candidateLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#f6c453" }));
    this.candidateMarker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.19, 24), new THREE.MeshBasicMaterial({ color: "#f6c453", side: THREE.DoubleSide }));
    this.candidateMarker.rotation.x = -Math.PI / 2;
    this.candidateGroup.add(this.candidateLine, this.candidateMarker);
    scene.add(this.root);
    this.applyVisibility();
  }

  public setFlags(flags: Partial<DebugFlags>): void { this.flags = { ...this.flags, ...flags }; this.applyVisibility(); }
  public getFlags(): DebugFlags { return { ...this.flags }; }

  public update(candidate?: SnapCandidate, dragPlane?: THREE.Plane): void {
    if (candidate !== undefined) this.candidate = candidate;
    if (dragPlane !== undefined) this.dragPlane = dragPlane;
    this.updateConnectors();
    this.updateColliders();
    this.updateCandidate(this.candidate);
    this.updateConnections();
    this.updateDragPlane(this.dragPlane);
    this.applyVisibility();
  }

  public setCandidate(candidate: SnapCandidate | undefined): void { this.candidate = candidate; }
  public setDragPlane(dragPlane: THREE.Plane | undefined): void { this.dragPlane = dragPlane; }

  public dispose(): void {
    for (const pair of this.connectorMarkers) { pair.marker.geometry.dispose(); (pair.marker.material as THREE.Material).dispose(); pair.arrow.line.geometry.dispose(); (pair.arrow.line.material as THREE.Material).dispose(); pair.arrow.cone.geometry.dispose(); (pair.arrow.cone.material as THREE.Material).dispose(); }
    for (const helper of this.colliderHelpers) { helper.geometry.dispose(); (helper.material as THREE.Material).dispose(); }
    for (const line of this.connectionLines) { line.geometry.dispose(); (line.material as THREE.Material).dispose(); }
    this.candidateLine.geometry.dispose(); (this.candidateLine.material as THREE.Material).dispose();
    this.candidateMarker.geometry.dispose(); (this.candidateMarker.material as THREE.Material).dispose();
    if (this.planeHelper !== undefined) { this.planeHelper.geometry.dispose(); (this.planeHelper.material as THREE.Material).dispose(); }
    this.scene.remove(this.root);
  }

  private updateConnectors(): void {
    let cursor = 0;
    for (const brick of this.engine.bricks.values()) {
      const part = this.engine.parts.get(brick.partId);
      for (const connector of this.engine.connectors.getWorldConnectors(brick, part)) {
        const pair = this.connectorMarkers[cursor] ?? this.createConnectorMarker();
        const color = connector.type === "stud" ? "#f0b84d" : "#71a7c7";
        pair.marker.position.set(connector.worldPosition.x, connector.worldPosition.y, connector.worldPosition.z);
        (pair.marker.material as THREE.MeshBasicMaterial).color.set(color);
        pair.arrow.position.copy(pair.marker.position);
        pair.arrow.setDirection(new THREE.Vector3(connector.worldNormal.x, connector.worldNormal.y, connector.worldNormal.z));
        pair.arrow.setColor(color);
        pair.marker.visible = true;
        pair.arrow.visible = true;
        cursor += 1;
      }
    }
    for (; cursor < this.connectorMarkers.length; cursor += 1) { const pair = this.connectorMarkers[cursor]; if (pair !== undefined) { pair.marker.visible = false; pair.arrow.visible = false; } }
  }

  private updateColliders(): void {
    let cursor = 0;
    for (const collider of this.engine.brickSpatial.values()) {
      const box = new THREE.Box3(new THREE.Vector3(collider.bounds.min.x, collider.bounds.min.y, collider.bounds.min.z), new THREE.Vector3(collider.bounds.max.x, collider.bounds.max.y, collider.bounds.max.z));
      const helper = this.colliderHelpers[cursor] ?? this.createColliderHelper();
      helper.box.copy(box);
      helper.visible = true;
      cursor += 1;
    }
    for (; cursor < this.colliderHelpers.length; cursor += 1) { const helper = this.colliderHelpers[cursor]; if (helper !== undefined) helper.visible = false; }
  }

  private updateCandidate(candidate: SnapCandidate | undefined): void {
    if (candidate === undefined) { this.candidateLine.visible = false; this.candidateMarker.visible = false; return; }
    const start = new THREE.Vector3(candidate.anchorPair.moving.worldPosition.x, candidate.anchorPair.moving.worldPosition.y, candidate.anchorPair.moving.worldPosition.z);
    const end = new THREE.Vector3(candidate.anchorPair.target.worldPosition.x, candidate.anchorPair.target.worldPosition.y, candidate.anchorPair.target.worldPosition.z);
    this.candidateLine.geometry.setFromPoints([start, end]);
    this.candidateLine.visible = true;
    (this.candidateLine.material as THREE.LineBasicMaterial).color.set(candidate.stable ? "#f6c453" : "#f1e3a5");
    this.candidateMarker.position.copy(end);
    (this.candidateMarker.material as THREE.MeshBasicMaterial).color.set(candidate.stable ? "#f6c453" : "#f1e3a5");
    this.candidateMarker.visible = true;
  }

  private updateConnections(): void {
    let cursor = 0;
    for (const group of this.engine.graph.values()) {
      const a = this.engine.bricks.tryGet(group.brickA);
      const b = this.engine.bricks.tryGet(group.brickB);
      if (a === undefined || b === undefined) continue;
      const line = this.connectionLines[cursor] ?? this.createConnectionLine();
      line.geometry.setFromPoints([new THREE.Vector3(a.transform.position.x, a.transform.position.y, a.transform.position.z), new THREE.Vector3(b.transform.position.x, b.transform.position.y, b.transform.position.z)]);
      line.visible = true;
      cursor += 1;
    }
    for (; cursor < this.connectionLines.length; cursor += 1) { const line = this.connectionLines[cursor]; if (line !== undefined) line.visible = false; }
  }

  private updateDragPlane(plane: THREE.Plane | undefined): void {
    if (plane === undefined) { if (this.planeHelper !== undefined) this.planeHelper.visible = false; return; }
    this.planeHelper ??= this.createPlaneHelper(plane);
    this.planeHelper.plane.copy(plane);
    this.planeHelper.visible = true;
  }

  private createConnectorMarker(): { marker: THREE.Mesh; arrow: THREE.ArrowHelper } {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: "#f0b84d" }));
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), marker.position, 0.22, "#f0b84d", 0.06, 0.035);
    this.connectorGroup.add(marker, arrow);
    const pair = { marker, arrow };
    this.connectorMarkers.push(pair);
    return pair;
  }

  private createColliderHelper(): THREE.Box3Helper { const helper = new THREE.Box3Helper(new THREE.Box3(), "#d85a5a"); this.colliderGroup.add(helper); this.colliderHelpers.push(helper); return helper; }
  private createConnectionLine(): THREE.Line { const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#7e8b8e" })); this.connectionGroup.add(line); this.connectionLines.push(line); return line; }
  private createPlaneHelper(plane: THREE.Plane): THREE.PlaneHelper { const helper = new THREE.PlaneHelper(plane, 8, "#8aa3a3"); this.dragPlaneGroup.add(helper); return helper; }
  private applyVisibility(): void { this.connectorGroup.visible = this.flags.connectors; this.colliderGroup.visible = this.flags.colliders; this.candidateGroup.visible = this.flags.candidate; this.connectionGroup.visible = this.flags.connections; this.dragPlaneGroup.visible = this.flags.dragPlane; }
}
