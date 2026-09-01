import type { BrickProjectSnapshot } from "../../src/serialization/project-snapshot.js";
import type { ProjectFile } from "./project-types.js";

export const PROJECT_FILE_FORMAT_VERSION = 1;

export const createProjectFile = (
  project: { id: string; name: string },
  snapshot: BrickProjectSnapshot,
  savedAt = new Date().toISOString()
): ProjectFile => ({
  format: "brick-project",
  formatVersion: PROJECT_FILE_FORMAT_VERSION,
  project: { id: project.id, name: project.name },
  snapshot,
  savedAt
});

