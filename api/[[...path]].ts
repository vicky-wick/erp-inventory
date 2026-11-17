// Vercel serverless entry: /api/[...path]
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleApi } from "../server/app";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleApi(req as never, res as never);
}
