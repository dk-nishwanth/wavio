import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { upsertContact } from "@/lib/core";

/** Body: { csv, consent: true, tag? }. CSV header: phone,name,email[,var2,var3...] */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const { csv, consent, tag } = await req.json();
  if (!consent) return json({ error: "You must confirm these contacts have opted in to WhatsApp messages" }, 400);
  const lines = String(csv).split(/\r?\n/).filter((l) => l.trim());
  const head = lines.shift()!.split(",").map((h) => h.trim().toLowerCase());
  let ok = 0; const errors: string[] = [];
  for (const [i, line] of lines.entries()) {
    const cells = line.split(",").map((x) => x.trim());
    const row: Record<string, string> = Object.fromEntries(head.map((h, j) => [h, cells[j] ?? ""]));
    try {
      const { phone, name, email, ...attrs } = row;
      upsertContact(s.workspaceId, { phone, name, email, attrs, tags: tag ? [tag] : [], optedIn: true });
      ok++;
    } catch (e: any) { errors.push(`Row ${i + 2}: ${e.message}`); }
  }
  return json({ imported: ok, errors: errors.slice(0, 20) });
});
