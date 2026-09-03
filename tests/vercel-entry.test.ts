import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ handleVercelApiRequest: vi.fn() }));
vi.mock("../server/http/vercel-adapter.js", () => mocks);

const { default: vercelApiIndexHandler } = await import("../api/index.js");

describe("Vercel API entry", () => {
  beforeEach(() => { mocks.handleVercelApiRequest.mockClear(); });

  it("uses the path-restoring mode for the single-entry rewrite", async () => {
    const request = {} as IncomingMessage;
    const response = {} as ServerResponse;
    await vercelApiIndexHandler(request, response);
    expect(mocks.handleVercelApiRequest).toHaveBeenCalledWith(request, response, true);
  });
});
