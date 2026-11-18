import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { buildReport } from "@/lib/reports";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  return json(buildReport(s.workspaceId, days));
});
