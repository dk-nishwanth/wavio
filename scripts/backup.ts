// Writes a verified snapshot of the database. Usage: npm run backup
import fs from "node:fs";
for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
async function main() {
  const { backupNow } = await import("../lib/backup");
  console.log("Backup written:", backupNow());
}
main();
