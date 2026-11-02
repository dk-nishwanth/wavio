import { processDue } from "@/lib/queue";
import { tickScheduler } from "@/lib/jobs";
import { handle, json } from "@/lib/http";

/** Call every minute from a scheduler (Vercel Cron, curl, etc.) if you don't run the worker process. */
export const GET = handle(async (req: Request) => {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) return json({ error: "Unauthorized" }, 401);
  tickScheduler();
  return json({ processed: await processDue(100) });
});
