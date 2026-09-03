import type { IncomingMessage, ServerResponse } from "node:http";
import { handleVercelApiRequest } from "../server/http/vercel-adapter.js";

/** Vercel 多级 API rewrite 的单层入口，先恢复原始路径再调用共享处理器。 */
export default async function vercelApiIndexHandler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  await handleVercelApiRequest(request, response, true);
}
