import { readFile } from "node:fs/promises";

const path = "docs/release/V1-CHECKLIST.md";
const checklist = await readFile(path, "utf8");
const requiredSections = ["## CI", "## Database migration", "## Asset release", "## Rollback", "## Performance", "## E2E", "## Offline", "## Security", "## Telemetry", "## Monitoring", "## Backup", "## Post-deploy smoke", "## Release artifact"];
const missing = requiredSections.filter((section) => !checklist.includes(section));
if (missing.length > 0) throw new Error(`Release checklist is missing sections: ${missing.join(", ")}`);
if (!checklist.includes("Expand → Deploy → Contract") || !checklist.includes("forward-fix")) throw new Error("Release checklist must document the migration strategy");
process.stdout.write(`${JSON.stringify({ event: "release_checklist_valid", sections: requiredSections.length })}\n`);
