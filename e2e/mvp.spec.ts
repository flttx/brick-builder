import { expect, request as playwrightRequest, test } from "@playwright/test";

test("register, create project, open editor, and start a part placement", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await page.getByRole("button", { name: /还没有账号/ }).click();
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill("correct horse battery staple");
  await page.getByRole("button", { name: "注册账号" }).click();
  await expect(page.getByRole("heading", { name: "我的作品" })).toBeVisible();
  const editorGlbResponse = page.waitForResponse((response) => response.url().includes("/lod0.glb"), { timeout: 10_000 });
  await page.getByRole("button", { name: "新建作品" }).click();
  await expect(page.getByRole("heading", { name: "未命名作品" })).toBeVisible();
  expect((await editorGlbResponse).ok()).toBe(true);
  await page.getByRole("button", { name: "打开零件库" }).click();
  await expect(page.locator(".part-thumb-image")).toHaveCount(17);
  await page.getByRole("button", { name: "放置 砖块 2×4" }).click();
  await expect(page.getByRole("status").filter({ hasText: "放置 砖块 2×4" })).toBeVisible();
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("Editor canvas is not available");
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.57);
  await page.mouse.up();
  await expect(page.getByText(/砖块 2×4 · 0 个连接点/)).toBeVisible();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByText(/已恢复上次未保存的修改|已从本地草稿恢复/)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".readout-row").filter({ hasText: "积木" }).getByText("1")).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "我的作品" }).click();
  await expect(page.getByRole("heading", { name: "我的作品" })).toBeVisible();
  await expect(page.getByText("未命名作品").first()).toBeVisible();
  await expect(page.getByText(/1 块积木/)).toBeVisible();
  await page.getByRole("button", { name: "重命名" }).click();
  await page.getByLabel("作品名称").fill("Recovered Build");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recovered Build" })).toBeVisible();
  await page.getByRole("button", { name: "打开" }).click();
  await expect(page.getByRole("heading", { name: "Recovered Build" })).toBeVisible();
  await expect(page.locator(".readout-row").filter({ hasText: "积木" }).getByText("1")).toBeVisible();
  await page.getByRole("button", { name: "我的作品" }).click();
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill("correct horse battery staple");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "我的作品" })).toBeVisible();
});

test("mobile My Builds surface keeps the primary action reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /欢迎回来|我的作品/ })).toBeVisible();
});

test("auth and My Builds do not request renderer or physics chunks", async ({ page }) => {
  const loaded = new Set<string>();
  page.on("request", (request) => loaded.add(request.url()));
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await page.waitForTimeout(500);
  expect([...loaded].some((url) => /(?:three|rapier|GLTFLoader)/iu.test(url))).toBe(false);
});

test("shows a conflict resolver when another device advances the revision", async ({ page }) => {
  const email = `conflict-${Date.now()}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: /还没有账号/ }).click();
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill("correct horse battery staple");
  await page.getByRole("button", { name: "注册账号" }).click();
  await page.getByRole("button", { name: "新建作品" }).click();
  await expect(page.getByRole("heading", { name: "未命名作品" })).toBeVisible();

  const api = await playwrightRequest.newContext({ baseURL: "http://127.0.0.1:8787" });
  try {
    await api.post("/api/auth/login", { data: { email, password: "correct horse battery staple" } });
    const projects = await api.get("/api/projects");
    const projectList = await projects.json() as Array<{ id: string }>;
    const projectId = projectList[0]?.id;
    if (projectId === undefined) throw new Error("E2E project was not created");
    const detail = await api.get(`/api/projects/${projectId}`);
    const current = await detail.json() as { snapshot: { version: 1; bricks: []; connections: [] } };
    await api.put(`/api/projects/${projectId}/document`, { data: { clientRevision: 1, baseServerRevision: 1, snapshot: { ...current.snapshot, bricks: [{ id: "remote-brick", partId: "brick-1x1", colorId: "blue", position: [0, 0, 0], rotation: [0, 0, 0, 1] }], connections: [] } } });
  } finally {
    await api.dispose();
  }

  await page.getByRole("button", { name: "打开零件库" }).click();
  await page.getByRole("tab", { name: "砖块" }).click();
  await page.getByRole("button", { name: "放置 砖块 2×4" }).click();
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("Editor canvas is not available");
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.57);
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "作品存在版本冲突" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "加载云端版本" })).toBeVisible();
});

test("inspects the runtime asset pack and saves an authoring overlay", async ({ page }) => {
  const glbResponse = page.waitForResponse((response) => response.url().includes("/lod0.glb"), { timeout: 10_000 });
  await page.goto("/assets");
  expect((await glbResponse).ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "资产检查器" })).toBeVisible();
  await expect(page.getByText("17 个零件")).toBeVisible();
  await expect(page.locator(".asset-part-list img")).toHaveCount(17);
  await expect(page.getByText("校验通过", { exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();

  await page.goto("/authoring?asset=brick-2x4");
  await expect(page.getByRole("heading", { name: "零件编辑器" })).toBeVisible();
  await page.getByRole("button", { name: "添加凸点" }).click();
  const addedConnector = page.locator(".authoring-list").first().getByRole("button", { name: /manual-stud-9/ });
  await expect(addedConnector).toBeVisible();
  await addedConnector.click();
  await page.getByRole("button", { name: "旋转 90°" }).click();
  await page.getByRole("button", { name: "保存元数据" }).click();
  await expect(page.getByText("已保存到本机")).toBeVisible();
  await page.reload();
  await expect(page.locator(".authoring-list").first().getByRole("button", { name: /manual-stud-9/ })).toBeVisible();
});

test("exposes production-safe diagnostics and development fault controls", async ({ page }) => {
  const email = `debug-${Date.now()}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: /还没有账号/ }).click();
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill("correct horse battery staple");
  await page.getByRole("button", { name: "注册账号" }).click();
  await page.getByRole("button", { name: "新建作品" }).click();
  await expect(page.getByRole("heading", { name: "未命名作品" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "场景" })).toBeVisible();
  await page.getByRole("button", { name: "立即验证" }).click();
  await expect(page.getByText("一致", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "故障注入" }).click();
  const offlineFault = page.getByLabel("模拟离线");
  await expect(offlineFault).toBeVisible();
  await offlineFault.check();
  await expect(offlineFault).toBeChecked();
});

test("keeps local editing visible when the session expires during cloud save", async ({ page }) => {
  const email = `expired-${Date.now()}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: /还没有账号/ }).click();
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill("correct horse battery staple");
  await page.getByRole("button", { name: "注册账号" }).click();
  await page.getByRole("button", { name: "新建作品" }).click();
  await expect(page.getByRole("heading", { name: "未命名作品" })).toBeVisible();
  await page.route("**/api/projects/*/document", async (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "AUTH_REQUIRED", message: "expired" }) }));
  await page.getByRole("button", { name: "打开零件库" }).click();
  await page.getByRole("button", { name: "放置 砖块 2×4" }).click();
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("Editor canvas is not available");
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.57);
  await page.mouse.up();
  await expect(page.getByText(/砖块 2×4 · 0 个连接点/)).toBeVisible();
  await expect(page.locator(".auth-expiry-banner").filter({ hasText: "登录状态已过期" })).toBeVisible({ timeout: 6_000 });
});

test("reopens the cached project after API connectivity is lost", async ({ page }) => {
  const email = `offline-${Date.now()}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: /还没有账号/ }).click();
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill("correct horse battery staple");
  await page.getByRole("button", { name: "注册账号" }).click();
  await page.getByRole("button", { name: "新建作品" }).click();
  await expect(page.getByRole("heading", { name: "未命名作品" })).toBeVisible();
  await page.getByRole("button", { name: "打开零件库" }).click();
  await page.getByRole("button", { name: "放置 砖块 2×4" }).click();
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("Editor canvas is not available");
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.57);
  await page.mouse.up();
  await expect(page.getByText(/砖块 2×4 · 0 个连接点/)).toBeVisible();
  await page.waitForTimeout(800);
  await page.route("**/api/**", (route) => route.abort());
  await page.reload();
  await expect(page.getByText(/已恢复上次未保存的修改|已从本地草稿恢复/)).toBeVisible({ timeout: 10_000 });
});
