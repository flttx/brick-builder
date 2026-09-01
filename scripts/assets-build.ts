import { resolve } from "node:path";
import { buildAssetPack } from "../packages/brick-assets/pipeline.js";

const projectRoot = process.cwd();
const args = process.argv.slice(2).filter((value) => !value.startsWith("--"));
const force = process.argv.includes("--force");
const report = await buildAssetPack({ projectRoot, ...(args.length === 0 ? {} : { partIds: args }), force });
process.stdout.write(`${JSON.stringify({ event: "asset_build_complete", assetPackVersion: report.assetPackVersion, built: report.built, skipped: report.skipped, output: resolve(projectRoot, "apps/web/public/assets/asset-pack") })}\n`);
