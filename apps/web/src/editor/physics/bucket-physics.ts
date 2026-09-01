import type * as Rapier from "@dimforge/rapier3d-compat";

export type BucketPhysicsMode = "rapier" | "tween";

export interface BucketPhysicsOptions {
  mode?: BucketPhysicsMode;
  bodyCount?: number;
  seed: number;
  gravity?: number;
}

export interface BucketPhysicsSession {
  readonly mode: BucketPhysicsMode;
  readonly bodyCount: number;
  update(deltaSeconds: number): void;
  dispose(): void;
}

export const createBucketPhysicsSession = async (options: BucketPhysicsOptions): Promise<BucketPhysicsSession> => {
  const bodyCount = Math.max(0, Math.min(30, Math.floor(options.bodyCount ?? 10)));
  if (options.mode === "tween" || bodyCount === 0) return new TweenBucketPhysicsSession(bodyCount);
  try {
    const rapier = await import("@dimforge/rapier3d-compat");
    await rapier.init();
    return new RapierBucketPhysicsSession(rapier, bodyCount, options.seed, options.gravity ?? -9.81);
  } catch {
    return new TweenBucketPhysicsSession(bodyCount);
  }
};

class TweenBucketPhysicsSession implements BucketPhysicsSession {
  public readonly mode = "tween" as const;
  public constructor(public readonly bodyCount: number) {}
  public update(_deltaSeconds: number): void { return undefined; }
  public dispose(): void { return undefined; }
}

class RapierBucketPhysicsSession implements BucketPhysicsSession {
  public readonly mode = "rapier" as const;
  private readonly world: Rapier.World;
  private readonly bodies: Rapier.RigidBody[] = [];

  public constructor(private readonly rapier: typeof Rapier, public readonly bodyCount: number, seed: number, gravity: number) {
    this.world = new rapier.World({ x: 0, y: gravity, z: 0 });
    const random = seededRandom(seed);
    for (let index = 0; index < bodyCount; index += 1) {
      const body = this.world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation((random() - 0.5) * 0.8, 0.8 + random() * 1.4, (random() - 0.5) * 0.8).setLinvel((random() - 0.5) * 0.8, random() * 0.8, (random() - 0.5) * 0.8));
      this.world.createCollider(rapier.ColliderDesc.cuboid(0.12, 0.12, 0.12), body);
      this.bodies.push(body);
    }
  }

  public update(_deltaSeconds: number): void { this.world.step(); }
  public dispose(): void { this.world.free(); this.bodies.length = 0; }
}

const seededRandom = (seed: number): (() => number) => { let value = seed >>> 0; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 0x1_0000_0000; }; };

