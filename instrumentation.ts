// Runs the job loop inside the Next.js server process so messages send without a separate `npm run worker`.
// Skipped on Vercel (no long-running processes — use /api/cron/tick there) or with INLINE_WORKER=0.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL || process.env.INLINE_WORKER === "0") return;
  const g = globalThis as unknown as { __inlineWorker?: boolean };
  if (g.__inlineWorker) return;
  g.__inlineWorker = true;
  const { processDue } = await import("./lib/queue");
  const { tickScheduler } = await import("./lib/jobs");
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      tickScheduler();
      await processDue(50);
    } catch (e) {
      console.error("inline worker error", e);
    } finally {
      busy = false;
    }
  }, 1000).unref();
}
