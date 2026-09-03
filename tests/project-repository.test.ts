import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpProjectRepository } from "../packages/project-persistence/project-repository.js";

afterEach(() => { vi.unstubAllGlobals(); });

describe("HTTP project repository errors", () => {
  it("preserves the auth error code for the login screen", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ code: "AUTH_INVALID", message: "邮箱或密码不正确。" }), { status: 401, headers: { "content-type": "application/json" } })));
    await expect(new HttpProjectRepository().login("user@example.com", "wrong-password")).rejects.toMatchObject({ name: "ApiRequestError", apiError: { code: "AUTH_INVALID" } });
  });

  it("preserves a server-unavailable response instead of treating it as a password mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ code: "API_UNAVAILABLE", message: "服务暂时不可用，请稍后重试。" }), { status: 500, headers: { "content-type": "application/json" } })));
    await expect(new HttpProjectRepository().login("user@example.com", "password")).rejects.toMatchObject({ name: "ApiRequestError", apiError: { code: "API_UNAVAILABLE" } });
  });
});
