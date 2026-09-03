import type { IncomingMessage, ServerResponse } from "node:http";
import { handleVercelApiRequest } from "../server/http/vercel-adapter.js";

export default async function vercelApiHandler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  await handleVercelApiRequest(request, response);
}
