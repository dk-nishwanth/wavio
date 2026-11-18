import { get } from "@/lib/db";
import { NextResponse } from "next/server";

/** For uptime monitors and Docker. Public, reveals nothing sensitive: just whether the app, database and job queue are alive. */
export async function GET() {
  try {
    const jobs = get<any>("SELECT COUNT(*) n, MIN(run_at) oldest FROM jobs WHERE status='pending' AND run_at <= ?", Date.now())!;
    const stuck = jobs.oldest ? Date.now() - jobs.oldest > 5 * 60_000 : false; // due work waiting over 5 minutes means the job loop has stopped
    return NextResponse.json({ ok: !stuck, db: true, dueJobs: jobs.n, jobLoop: stuck ? "stalled" : "ok", time: new Date().toISOString() }, { status: stuck ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
