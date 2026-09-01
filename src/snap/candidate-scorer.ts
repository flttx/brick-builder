import type { SnapCandidate } from "./snap-types.js";

export const rankSnapCandidates = (candidates: SnapCandidate[]): SnapCandidate[] =>
  [...candidates].sort((a, b) => b.score - a.score || a.distance - b.distance || a.id.localeCompare(b.id));

export const chooseBestSnapCandidate = (candidates: SnapCandidate[]): SnapCandidate | undefined =>
  rankSnapCandidates(candidates.filter((candidate) => candidate.collision.valid))[0];
