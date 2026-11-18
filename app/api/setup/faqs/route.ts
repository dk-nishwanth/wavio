import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { FAQ_TEMPLATES, currentSetupAnswers, saveSetupFaqs } from "@/lib/setup";
import { audit } from "@/lib/audit";

export const GET = handle(async () => {
  const s = await requireSession();
  return json({ templates: FAQ_TEMPLATES, answers: currentSetupAnswers(s.workspaceId) });
});

/** Body: { answers: { wifi: "Free Wi-Fi…", parking: "…" } } */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  const saved = saveSetupFaqs(s.workspaceId, b.answers ?? {});
  audit(s, "setup.answers", `${saved} answers saved`);
  return json({ saved });
});
