import { ConnectorCompatibilityRegistry } from "../connectors/compatibility.js";
import { ConnectorOccupancyIndex } from "../connectors/occupancy-index.js";
import { ConnectorSpatialIndex } from "../connectors/connector-spatial-index.js";
import { ConnectorSystem } from "../connectors/connector-system.js";
import { ConsistencyValidator, type ConsistencyResult } from "../connections/consistency-validator.js";
import { ConnectionGraph } from "../connections/connection-graph.js";
import { ConnectionManager } from "../connections/connection-manager.js";
import type { ConnectionGroup } from "../connections/connection-types.js";
import { DEFAULT_COLLISION_CONFIG, type CollisionConfig } from "../collision/box-collision.js";
import { CollisionSolver, toWorldCollider } from "../collision/collision-solver.js";
import { AddBrickCommand } from "../commands/add-brick-command.js";
import { AddPlacedBrickCommand } from "../commands/add-placed-brick-command.js";
import type { Command, EngineCommandContext } from "../commands/command.js";
import { CommandHistory } from "../commands/command-history.js";
import { DeleteBrickCommand } from "../commands/delete-brick-command.js";
import { PlaceBrickCommand } from "../commands/place-brick-command.js";
import { RotateBrickCommand } from "../commands/rotate-brick-command.js";
import { ChangeColorCommand } from "../commands/change-color-command.js";
import { createDetachSnapshot } from "../drag/detach-controller.js";
import type { DetachSnapshot, DragSession } from "../drag/drag-session.js";
import { PlacementValidator } from "../drag/placement-validator.js";
import type { PlacementMode } from "../drag/placement-mode.js";
import { identity, multiply, normalize, yRotationQuarter } from "../math/quat.js";
import { cloneTransform, type Transform } from "../math/transform.js";
import { distance } from "../math/vec3.js";
import type { BrickInstance } from "../parts/brick-instance.js";
import { createMissingPartDefinition } from "../parts/part-definition.js";
import { BrickStore } from "../parts/brick-store.js";
import { PartRegistry } from "../parts/part-registry.js";
import { createStandardPartDefinitions } from "../parts/standard-part-catalog.js";
import { BrickColorRegistry } from "../colors/brick-color.js";
import { ProjectLoader } from "../serialization/project-loader.js";
import { serializeProject, type BrickProjectSnapshot } from "../serialization/project-snapshot.js";
import { DEFAULT_SNAP_CONFIG, type SnapConfig } from "../snap/snap-config.js";
import { SnapSolver } from "../snap/snap-solver.js";
import type { DragResult, ExplicitSnapRequest, ExplicitSnapResult, SnapContext } from "../snap/snap-types.js";
import { BrickSpatialIndex } from "../spatial/brick-spatial-index.js";

export interface CreateBrickRequest {
  id?: string;
  partId?: string;
  colorId?: string;
  transform?: Transform;
  locked?: boolean;
  visible?: boolean;
}

export interface BrickEngineOptions {
  parts?: PartRegistry;
  colors?: BrickColorRegistry;
  compatibility?: ConnectorCompatibilityRegistry;
  snapConfig?: Partial<SnapConfig>;
  collisionConfig?: Partial<CollisionConfig>;
  connectorCellSize?: number;
  brickCellSize?: number;
  detachThreshold?: number;
}

export interface CommandCommittedEvent {
  commandName: string;
}

export type CommandCommittedListener = (event: CommandCommittedEvent) => void;

export class BrickEngine {
  public readonly parts: PartRegistry;
  public readonly colors: BrickColorRegistry;
  public readonly bricks = new BrickStore();
  public readonly connectors: ConnectorSystem;
  public readonly occupancy = new ConnectorOccupancyIndex();
  public readonly spatial: ConnectorSpatialIndex;
  public readonly brickSpatial: BrickSpatialIndex;
  public readonly graph = new ConnectionGraph();
  public readonly connections: ConnectionManager;
  public readonly collision: CollisionSolver;
  public readonly placement: PlacementValidator;
  public readonly history = new CommandHistory();
  public readonly snap: SnapSolver;

  private readonly commandContext: EngineCommandContext;
  private readonly loader: ProjectLoader;
  private readonly consistency: ConsistencyValidator;
  private readonly detachThreshold: number;
  private nextBrickNumber = 1;
  private nextConnectionNumber = 1;
  private dragSession: DragSession | undefined;
  private detachSnapshot: DetachSnapshot | undefined;
  private dragStartConnections: ConnectionGroup[] = [];
  private dragPlacementValid = true;
  private readonly commandCommittedListeners = new Set<CommandCommittedListener>();

  public constructor(options: BrickEngineOptions = {}) {
    this.parts = options.parts ?? new PartRegistry();
    for (const definition of createStandardPartDefinitions()) {
      if (!this.parts.has(definition.id)) {
        this.parts.register(definition);
      }
    }
    this.colors = options.colors ?? new BrickColorRegistry();
    this.connectors = new ConnectorSystem(options.compatibility ?? new ConnectorCompatibilityRegistry());
    this.spatial = new ConnectorSpatialIndex(options.connectorCellSize ?? 1);
    this.brickSpatial = new BrickSpatialIndex(options.brickCellSize ?? 1);
    this.connections = new ConnectionManager({
      parts: this.parts,
      bricks: this.bricks,
      connectors: this.connectors,
      occupancy: this.occupancy,
      graph: this.graph
    });
    const collisionConfig: CollisionConfig = {
      ...DEFAULT_COLLISION_CONFIG,
      ...options.collisionConfig
    };
    this.collision = new CollisionSolver(this.parts, this.brickSpatial, collisionConfig);
    const snapConfig: SnapConfig = {
      ...DEFAULT_SNAP_CONFIG,
      ...options.snapConfig
    };
    const snapContext: SnapContext = {
      parts: this.parts,
      bricks: this.bricks,
      connectors: this.connectors,
      occupancy: this.occupancy,
      spatial: this.spatial,
      collision: this.collision
    };
    this.snap = new SnapSolver(snapContext, snapConfig);
    this.placement = new PlacementValidator({
      parts: this.parts,
      bricks: this.bricks,
      connectors: this.connectors,
      occupancy: this.occupancy,
      collision: this.collision
    });
    this.detachThreshold = options.detachThreshold ?? 0.15;
    this.commandContext = {
      addBrick: (brick) => this.addBrickRuntime(brick),
      removeBrick: (brickId) => this.removeBrickRuntime(brickId),
      setTransform: (brickId, transform) => this.setTransformRuntime(brickId, transform),
      setColor: (brickId, colorId) => this.setColorRuntime(brickId, colorId),
      getBrick: (brickId) => this.bricks.get(brickId),
      getConnections: (brickId) => this.connections.getForBrick(brickId),
      replaceConnections: (brickId, groups) => this.replaceConnectionsRuntime(brickId, groups)
    };
    this.consistency = new ConsistencyValidator({
      parts: this.parts,
      bricks: this.bricks,
      graph: this.graph,
      occupancy: this.occupancy,
      connectorSpatial: this.spatial,
      brickSpatial: this.brickSpatial,
      connectors: this.connectors
    });
    this.loader = new ProjectLoader({
      parts: this.parts,
      bricks: this.bricks,
      graph: this.graph,
      connections: this.connections,
      occupancy: this.occupancy,
      rebuildIndexes: () => this.rebuildIndexes(),
      validate: () => this.validateEngineConsistency()
      ,ensurePart: (partId) => this.parts.upsert(createMissingPartDefinition(partId))
    });
  }

  public refreshPartDefinitions(): void {
    this.rebuildIndexes();
  }

  public createBrick(request?: CreateBrickRequest): string;
  public createBrick(partId: string, colorId?: string, transform?: Transform, id?: string): string;
  public createBrick(
    requestOrPartId: CreateBrickRequest | string = {},
    colorId = "default",
    transform: Transform = { position: { x: 0, y: 0, z: 0 }, rotation: identity() },
    explicitId?: string
  ): string {
    const request: CreateBrickRequest = typeof requestOrPartId === "string"
      ? { partId: requestOrPartId, colorId, transform, ...(explicitId === undefined ? {} : { id: explicitId }) }
      : requestOrPartId;
    const partId = request.partId ?? "brick-2x4";
    this.parts.get(partId);
    const id = request.id ?? this.allocateBrickId();
    const brick: BrickInstance = {
      id,
      partId,
      colorId: request.colorId ?? "default",
      transform: cloneTransform(request.transform ?? { position: { x: 0, y: 0, z: 0 }, rotation: identity() }),
      ...(request.locked === undefined ? {} : { locked: request.locked }),
      ...(request.visible === undefined ? {} : { visible: request.visible })
    };
    this.executeCommand(new AddBrickCommand(this.commandContext, brick));
    return id;
  }

  public deleteBrick(brickId: string): void {
    if (this.dragSession?.brickId === brickId) {
      throw new Error("Cannot delete a brick during its drag session");
    }
    const brick = this.bricks.get(brickId);
    const groups = this.connections.getForBrick(brickId);
    this.executeCommand(new DeleteBrickCommand(this.commandContext, brick, groups));
  }

  public changeBrickColor(brickId: string, colorId: string): void {
    this.colors.get(colorId);
    const brick = this.bricks.get(brickId);
    if (brick.colorId === colorId) {
      return;
    }
    this.executeCommand(new ChangeColorCommand(this.commandContext, brickId, brick.colorId, colorId));
  }

  public addPlacedBrick(brick: BrickInstance, connections: ConnectionGroup[] = []): void {
    this.parts.get(brick.partId);
    this.colors.get(brick.colorId);
    if (this.bricks.has(brick.id)) {
      throw new Error(`Brick ${brick.id} already exists`);
    }
    this.executeCommand(new AddPlacedBrickCommand(this.commandContext, brick, connections));
  }

  public allocateConnectionId(): string {
    return this.nextConnectionId();
  }

  public beginDrag(brickId: string, placementMode: PlacementMode = "auto"): DragSession {
    if (this.dragSession !== undefined) {
      throw new Error("A drag session is already active");
    }
    const brick = this.bricks.get(brickId);
    if (brick.locked) {
      throw new Error(`Brick ${brickId} is locked`);
    }
    this.dragStartConnections = this.connections.getForBrick(brickId);
    this.detachSnapshot = undefined;
    this.dragPlacementValid = true;
    this.dragSession = {
      brickId,
      startTransform: cloneTransform(brick.transform),
      currentTransform: cloneTransform(brick.transform),
      mode: "free",
      placementMode
    };
    this.spatial.removeBrick(brickId);
    this.brickSpatial.removeBrick(brickId);
    return this.getDragSession();
  }

  public updateDrag(transform: Transform, pointerWorld?: { x: number; y: number; z: number }, placementMode?: PlacementMode): DragResult {
    const session = this.requireDragSession();
    session.placementMode = placementMode ?? session.placementMode;
    const brick = this.bricks.get(session.brickId);
    if (this.dragStartConnections.length > 0 && this.detachSnapshot === undefined && distance(session.startTransform.position, transform.position) > this.detachThreshold) {
      const removedGroups = this.connections.disconnectForBrick(session.brickId);
      this.detachSnapshot = createDetachSnapshot(session.brickId, session.startTransform, removedGroups);
    }
    const cannotSnapUntilDetach = this.dragStartConnections.length > 0 && this.detachSnapshot === undefined;
    const requestedTransform = cloneTransform(transform);
    const freeTransform = session.placementMode === "free"
      ? { ...requestedTransform, position: { ...requestedTransform.position, y: 0 } }
      : requestedTransform;
    const result = cannotSnapUntilDetach
      ? this.freeDragResult(brick, freeTransform)
      : this.snap.update({
          movingBrickId: session.brickId,
          freeTransform,
          ...(pointerWorld === undefined ? {} : { pointerWorld }),
          ...(session.snapCandidate === undefined ? {} : { previousCandidate: session.snapCandidate }),
          mode: session.placementMode === "auto" ? "auto" : "disabled"
        });
    const effectiveTransform = result.valid ? result.transform : freeTransform;
    this.dragPlacementValid = result.valid;
    session.currentTransform = cloneTransform(effectiveTransform);
    session.mode = result.valid ? result.mode : "free";
    if (result.candidate !== undefined && result.valid) {
      session.snapCandidate = result.candidate;
    } else if (result.mode === "free") {
      delete session.snapCandidate;
    }
    return {
      ...result,
      transform: cloneTransform(effectiveTransform),
      mode: session.mode,
      ...(session.snapCandidate === undefined ? {} : { candidate: session.snapCandidate })
    };
  }

  public commitDrag(): void {
    const session = this.requireDragSession();
    const brick = this.bricks.get(session.brickId);
    if (this.dragStartConnections.length > 0 && this.detachSnapshot === undefined) {
      this.restoreDragState();
      return;
    }
    if (!this.dragPlacementValid) {
      this.restoreDragState();
      throw new Error("Cannot commit an invalid brick placement");
    }
    if (session.placementMode === "auto" && session.snapCandidate === undefined) {
      this.restoreDragState();
      return;
    }
    const beforeTransform = cloneTransform(session.startTransform);
    const afterTransform = cloneTransform(session.currentTransform);
    if (session.placementMode === "free" && Math.abs(afterTransform.position.y) > 1e-4) {
      this.restoreDragState();
      throw new Error("Free placement must be committed on the ground");
    }
    const beforeConnections = this.dragStartConnections.map((group) => ({ ...group, pairs: group.pairs.map((pair) => ({ ...pair })) }));
    const afterConnections: ConnectionGroup[] = [];
    if (session.snapCandidate !== undefined && session.snapCandidate.collision.valid) {
      const candidate = session.snapCandidate;
      afterConnections.push({
        id: this.allocateConnectionId(),
        brickA: brick.id,
        brickB: candidate.targetBrickId,
        type: "rigid",
        pairs: candidate.matchedPairs.map((pair) => ({ connectorA: pair.moving.id, connectorB: pair.target.id }))
      });
    }
    const validation = this.placement.validate({
      brickId: session.brickId,
      transform: afterTransform,
      ...(session.snapCandidate === undefined ? {} : { matchedPairs: session.snapCandidate.matchedPairs })
    });
    if (!validation.valid) {
      this.restoreDragState();
      throw new Error(`Cannot commit an invalid brick placement: ${validation.reasons.join(", ")}`);
    }
    const command = new PlaceBrickCommand(
      this.commandContext,
      session.brickId,
      beforeTransform,
      afterTransform,
      beforeConnections,
      afterConnections
    );
    command.execute();
    this.history.recordExecuted(command);
    this.emitCommandCommitted(command.name);
    this.dragSession = undefined;
    this.detachSnapshot = undefined;
    this.dragStartConnections = [];
    this.dragPlacementValid = true;
  }

  public cancelDrag(): void {
    this.requireDragSession();
    this.restoreDragState();
  }

  public setDragPlacementMode(placementMode: PlacementMode): void {
    const session = this.requireDragSession();
    session.placementMode = placementMode;
  }

  public solveExplicitSnap(request: ExplicitSnapRequest): ExplicitSnapResult {
    return this.snap.solveExplicit(request);
  }

  public commitExplicitSnap(request: ExplicitSnapRequest): ExplicitSnapResult {
    if (this.dragSession !== undefined) {
      throw new Error("Cannot commit an explicit snap during a drag session");
    }
    const brick = this.bricks.get(request.movingBrickId);
    const beforeTransform = cloneTransform(brick.transform);
    const beforeConnections = this.connections.disconnectForBrick(brick.id);
    this.spatial.removeBrick(brick.id);
    this.brickSpatial.removeBrick(brick.id);
    let committed = false;
    try {
      const result = this.snap.solveExplicit({ ...request, freeTransform: beforeTransform });
      if (!result.valid || result.transform === undefined || result.candidate === undefined) {
        throw new Error(`Explicit snap rejected: ${result.reason ?? "collision"}`);
      }
      const afterConnections: ConnectionGroup[] = [{
        id: this.allocateConnectionId(),
        brickA: brick.id,
        brickB: request.targetBrickId,
        type: "rigid",
        pairs: result.matchedPairs.map((pair) => ({ connectorA: pair.moving.id, connectorB: pair.target.id }))
      }];
      const validation = this.placement.validate({
        brickId: brick.id,
        transform: result.transform,
        matchedPairs: result.matchedPairs
      });
      if (!validation.valid) {
        throw new Error(`Explicit snap rejected: ${validation.reasons.join(",")}`);
      }
      const command = new PlaceBrickCommand(
        this.commandContext,
        brick.id,
        beforeTransform,
        result.transform,
        beforeConnections,
        afterConnections
      );
      command.execute();
      this.history.recordExecuted(command);
      committed = true;
      return result;
    } finally {
      if (!committed) {
        this.connections.disconnectForBrick(brick.id);
        this.bricks.setTransform(brick.id, beforeTransform);
        this.connections.restore(beforeConnections);
        this.syncBrickIndexes(brick.id);
      }
    }
  }

  public rotateBrick(brickId: string, quarterTurns = 1): void {
    if (this.dragSession?.brickId === brickId) {
      throw new Error("Cannot rotate a brick during its drag session");
    }
    const brick = this.bricks.get(brickId);
    const before = cloneTransform(brick.transform);
    const after: Transform = {
      position: { ...before.position },
      rotation: normalize(multiply(yRotationQuarter(quarterTurns), before.rotation))
    };
    this.executeCommand(new RotateBrickCommand(this.commandContext, brickId, before, after, this.connections.getForBrick(brickId)));
  }

  public undo(): boolean {
    const undone = this.history.undo();
    if (undone) {
      this.emitCommandCommitted("undo");
    }
    return undone;
  }

  public redo(): boolean {
    const redone = this.history.redo();
    if (redone) {
      this.emitCommandCommitted("redo");
    }
    return redone;
  }

  public subscribeCommandCommitted(listener: CommandCommittedListener): () => void {
    this.commandCommittedListeners.add(listener);
    return () => this.commandCommittedListeners.delete(listener);
  }

  public getSnapshot(): BrickProjectSnapshot {
    return serializeProject(this.bricks, this.graph);
  }

  public loadSnapshot(snapshot: BrickProjectSnapshot): void {
    if (this.dragSession !== undefined) {
      throw new Error("Cannot load a snapshot during a drag session");
    }
    this.loader.load(snapshot);
    this.history.clear();
  }

  public validateEngineConsistency(): ConsistencyResult {
    return this.consistency.validate();
  }

  public getDragSession(): DragSession {
    const session = this.requireDragSession();
    return {
      ...session,
      startTransform: cloneTransform(session.startTransform),
      currentTransform: cloneTransform(session.currentTransform),
      ...(session.snapCandidate === undefined ? {} : { snapCandidate: session.snapCandidate }),
      placementMode: session.placementMode
    };
  }

  public getConnectedComponent(brickId: string): string[] {
    return this.graph.getConnectedComponent(brickId);
  }

  public connect(group: ConnectionGroup): void {
    this.connections.connect(group);
  }

  public disconnect(groupId: string): ConnectionGroup | undefined {
    return this.connections.disconnect(groupId);
  }

  private addBrickRuntime(brick: BrickInstance): void {
    this.bricks.add(brick);
    this.syncBrickIndexes(brick.id);
  }

  private removeBrickRuntime(brickId: string): BrickInstance {
    this.connections.disconnectForBrick(brickId);
    this.spatial.removeBrick(brickId);
    this.brickSpatial.removeBrick(brickId);
    return this.bricks.delete(brickId);
  }

  private setTransformRuntime(brickId: string, transform: Transform): void {
    this.spatial.removeBrick(brickId);
    this.brickSpatial.removeBrick(brickId);
    this.bricks.setTransform(brickId, transform);
    this.syncBrickIndexes(brickId);
  }

  private setColorRuntime(brickId: string, colorId: string): void {
    this.colors.get(colorId);
    this.bricks.setColor(brickId, colorId);
  }

  private replaceConnectionsRuntime(brickId: string, groups: ConnectionGroup[]): void {
    this.connections.disconnectForBrick(brickId);
    this.connections.restore(groups);
  }

  private syncBrickIndexes(brickId: string): void {
    const brick = this.bricks.get(brickId);
    const part = this.parts.get(brick.partId);
    this.spatial.insertMany(this.connectors.getWorldConnectors(brick, part));
    this.brickSpatial.insertMany(part.colliders.map((collider) => toWorldCollider(brick, collider)));
  }

  private rebuildIndexes(): void {
    this.spatial.clear();
    this.brickSpatial.clear();
    this.occupancy.clear();
    for (const brick of this.bricks.values()) {
      this.syncBrickIndexes(brick.id);
    }
  }

  private restoreDragState(): void {
    const session = this.requireDragSession();
    this.spatial.removeBrick(session.brickId);
    this.brickSpatial.removeBrick(session.brickId);
    this.bricks.setTransform(session.brickId, session.startTransform);
    if (this.detachSnapshot !== undefined) {
      this.connections.restore(this.detachSnapshot.removedGroups);
    }
    this.syncBrickIndexes(session.brickId);
    this.dragSession = undefined;
    this.detachSnapshot = undefined;
    this.dragStartConnections = [];
  }

  private freeDragResult(brick: BrickInstance, transform: Transform): DragResult {
    const collision = this.collision.checkBrick(brick, transform);
    return {
      transform,
      mode: "free",
      collision,
      valid: collision.valid
    };
  }

  private requireDragSession(): DragSession {
    if (this.dragSession === undefined) {
      throw new Error("No active drag session");
    }
    return this.dragSession;
  }

  private executeCommand(command: Command): void {
    this.history.execute(command);
    this.emitCommandCommitted(command.name);
  }

  private emitCommandCommitted(commandName: string): void {
    const event = { commandName } satisfies CommandCommittedEvent;
    for (const listener of this.commandCommittedListeners) {
      listener(event);
    }
  }

  public allocateBrickId(): string {
    let id = `brick-${this.nextBrickNumber}`;
    while (this.bricks.has(id)) {
      this.nextBrickNumber += 1;
      id = `brick-${this.nextBrickNumber}`;
    }
    this.nextBrickNumber += 1;
    return id;
  }

  private nextConnectionId(): string {
    let id = `connection-${this.nextConnectionNumber}`;
    while (this.graph.tryGet(id) !== undefined) {
      this.nextConnectionNumber += 1;
      id = `connection-${this.nextConnectionNumber}`;
    }
    this.nextConnectionNumber += 1;
    return id;
  }
}
