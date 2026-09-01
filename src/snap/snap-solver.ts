import { distance } from "../math/vec3.js";
import { cloneTransform, GROUND_LEVEL } from "../math/transform.js";
import { validateSnapConfig, type SnapConfig, DEFAULT_SNAP_CONFIG } from "./snap-config.js";
import { generateExplicitSnap, generatePrecisionSnap, generateSnapCandidates } from "./candidate-generator.js";
import { chooseBestSnapCandidate } from "./candidate-scorer.js";
import type { DragResult, ExplicitSnapRequest, ExplicitSnapResult, PrecisionSnapRequest, PrecisionSnapResult, SnapCandidate, SnapContext, SnapRequest } from "./snap-types.js";

export class SnapSolver {
  public constructor(private readonly context: SnapContext, public readonly config: SnapConfig = DEFAULT_SNAP_CONFIG) {
    validateSnapConfig(config);
  }

  public solve(request: SnapRequest): SnapCandidate | undefined {
    if (request.mode === "disabled") {
      return undefined;
    }
    const candidates = generateSnapCandidates(this.context, request, this.config);
    const eligibleCandidates = candidates.filter((candidate) => {
      if (candidate.transform.position.y < GROUND_LEVEL - this.config.positionEpsilon) {
        return false;
      }
      if (candidate.distance <= this.config.enterRadius) {
        return true;
      }
      return request.previousCandidate !== undefined &&
        candidate.targetBrickId === request.previousCandidate.targetBrickId &&
        candidate.anchorPair.target.id === request.previousCandidate.anchorPair.target.id &&
        candidate.distance <= this.config.exitRadius;
    });
    const best = chooseBestSnapCandidate(eligibleCandidates);
    if (best === undefined || request.previousCandidate === undefined) {
      return best;
    }
    const previous = eligibleCandidates.find((candidate) => candidate.targetBrickId === request.previousCandidate?.targetBrickId && candidate.anchorPair.target.id === request.previousCandidate.anchorPair.target.id);
    if (previous !== undefined && distance(request.freeTransform.position, request.previousCandidate.transform.position) <= this.config.exitRadius) {
      return { ...previous, stable: true, score: previous.score + this.config.previousCandidateBonus };
    }
    return best;
  }

  public solveExplicit(request: ExplicitSnapRequest): ExplicitSnapResult {
    return generateExplicitSnap(this.context, request, this.config);
  }

  public solvePrecision(request: PrecisionSnapRequest): PrecisionSnapResult {
    return generatePrecisionSnap(this.context, request, this.config);
  }

  public update(request: SnapRequest): DragResult {
    const candidate = this.solve(request);
    if (candidate === undefined) {
      const collision = this.context.collision.checkBrick(
        this.context.bricks.get(request.movingBrickId),
        request.freeTransform
      );
      return {
        transform: cloneTransform(request.freeTransform),
        mode: "free",
        collision,
        valid: collision.valid
      };
    }
    return {
      transform: cloneTransform(candidate.transform),
      mode: "snap",
      candidate,
      collision: candidate.collision,
      valid: candidate.collision.valid
    };
  }
}
