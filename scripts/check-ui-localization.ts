import { readFileSync } from "node:fs";

const uiFiles = [
  "apps/web/index.html",
  "apps/web/src/app-root.tsx",
  "apps/web/src/editor/editor-app.tsx",
  "apps/web/src/editor/parts/part-browser.tsx",
  "apps/web/src/editor/precision/precision-overlay.tsx",
  "apps/web/src/asset-workbench/asset-inspector.tsx",
  "apps/web/src/editor/debug/devtools-shell.tsx"
];

const legacyUiPhrases = [
  "Welcome back",
  "Create your account",
  "My Builds",
  "New Build",
  "Log out",
  "Log in",
  "Register",
  "Continue locally",
  "Recent projects",
  "Open",
  "Rename",
  "Delete",
  "Save metadata",
  "Download JSON",
  "Choose a part",
  "Search parts",
  "Search 2×4",
  "Placement mode",
  "Place Brick 2x4",
  "Choose moving connector",
  "Choose target connector",
  "Runtime readout",
  "Asset Inspector",
  "Part Authoring",
  "Loading asset pack",
  "Loading manifest"
];

const hasQuotedLiteral = (source: string, phrase: string): boolean =>
  [`"${phrase}"`, `'${phrase}'`, `\`${phrase}\``].some((literal) => source.includes(literal));

const findings = uiFiles.flatMap((file) => {
  const source = readFileSync(file, "utf8");
  return legacyUiPhrases.filter((phrase) => hasQuotedLiteral(source, phrase)).map((phrase) => ({ file, phrase }));
});

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "ui_localization_failed", findings }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "ui_localization_passed", checkedFiles: uiFiles.length, checkedPhrases: legacyUiPhrases.length }));
}
