import { readFile } from "node:fs/promises";

const workflow = await readFile(".github/workflows/ci.yml", "utf8");
const required = ["quality:", "engine:", "assets:", "backend:", "web:", "e2e:", "performance-smoke:", "postgres:16", "npm ci --registry=https://registry.npmjs.org", "npm run typecheck", "npm run lint", "npm run test:unit", "npm run test:integration", "npm run assets:build:all", "npm run assets:determinism", "npm run build", "npm run bundle:check", "npm run benchmark:browser"];
const missing = required.filter((value) => !workflow.includes(value));
if (missing.length > 0) throw new Error(`CI workflow is missing required gates: ${missing.join(", ")}`);
if (!/DATABASE_URL:\s*postgres:\/\/postgres:postgres@postgres:5432\/brick_builder/iu.test(workflow)) throw new Error("Backend CI does not provide a PostgreSQL DATABASE_URL");
process.stdout.write(`${JSON.stringify({ event: "ci_config_valid", jobs: required.slice(0, 7) })}\n`);
