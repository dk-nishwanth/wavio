// Long-running job worker: sends messages, runs automation steps/waits, fires webhooks, dispatches scheduled campaigns.
import fs from "node:fs";
for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
async function main() {
  const { processDue } = await import("./lib/queue");
  const { tickScheduler } = await import("./lib/jobs");

  console.log("worker started");
  for (;;) {
    try {
      tickScheduler();
      const n = await processDue(50);
      if (n) console.log(`processed ${n} job(s)`);
    } catch (e) {
      console.error("worker error", e);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
main();
