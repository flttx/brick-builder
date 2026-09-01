const baseUrl = process.env.BASE_URL;
if (baseUrl === undefined || baseUrl.length === 0) throw new Error("BASE_URL is required");

const ensureTrailingSlash = (value: string): string => value.endsWith("/") ? value : `${value}/`;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : "unknown error";
const request = async (path: string, init: RequestInit = {}): Promise<Response> => fetch(new URL(path, ensureTrailingSlash(baseUrl)), { redirect: "manual", ...init });
const checks: Array<{ name: string; path: string; validate?: (response: Response) => Promise<void> }> = [
  { name: "health", path: "/api/health" },
  { name: "readiness", path: "/api/readiness" },
  { name: "app shell", path: "/", validate: async (response) => { const text = await response.text(); if (!text.includes('id="root"')) throw new Error("root element missing"); } },
  { name: "manifest", path: "/manifest.webmanifest", validate: async (response) => { const value = await response.json() as unknown; if (!isRecord(value) || typeof value.name !== "string") throw new Error("invalid manifest"); } },
  { name: "parts-index", path: "/assets/asset-pack/parts-index.json", validate: async (response) => { const value = await response.json() as unknown; if (!Array.isArray(value)) throw new Error("invalid parts index"); } }
];

let failed = false;
for (const check of checks) {
  try {
    const response = await request(check.path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await check.validate?.(response);
    process.stdout.write(`${JSON.stringify({ event: "production_smoke", check: check.name, status: "PASS" })}\n`);
  } catch (error) {
    failed = true;
    process.stderr.write(`${JSON.stringify({ event: "production_smoke", check: check.name, status: "FAIL", reason: errorMessage(error) })}\n`);
  }
}

const testEmail = process.env.TEST_EMAIL;
const testPassword = process.env.TEST_PASSWORD;
if ((testEmail === undefined) !== (testPassword === undefined)) throw new Error("TEST_EMAIL and TEST_PASSWORD must be configured together");
if (testEmail !== undefined && testPassword !== undefined) {
  try {
    const login = await request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: testEmail, password: testPassword }) });
    if (!login.ok) throw new Error(`login HTTP ${login.status}`);
    const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    if (cookie === undefined) throw new Error("session cookie missing");
    const session = await request("/api/auth/session", { headers: { cookie } });
    if (!session.ok) throw new Error(`session HTTP ${session.status}`);
    const projects = await request("/api/projects", { headers: { cookie } });
    if (!projects.ok) throw new Error(`projects HTTP ${projects.status}`);
    process.stdout.write(`${JSON.stringify({ event: "production_smoke", check: "auth/session/projects", status: "PASS" })}\n`);
  } catch (error) {
    failed = true;
    process.stderr.write(`${JSON.stringify({ event: "production_smoke", check: "auth/session/projects", status: "FAIL", reason: errorMessage(error) })}\n`);
  }
} else {
  process.stdout.write(`${JSON.stringify({ event: "production_smoke", check: "auth/session/projects", status: "SKIPPED", reason: "TEST_EMAIL and TEST_PASSWORD are not configured" })}\n`);
}

if (failed) process.exitCode = 1;
