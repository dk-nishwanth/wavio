import { all } from "@/lib/db";
import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { addText, fetchPage, fileToText } from "@/lib/kb";

export const GET = handle(async () => {
  const s = await requireSession();
  return json(all("SELECT id, kind, title, origin, status, chars, created_at FROM kb_sources WHERE workspace_id=? ORDER BY created_at DESC", s.workspaceId));
});

/** JSON {title, text} to paste text, JSON {url} to read a web page, or multipart with a PDF/text file. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file uploaded");
    if (file.size > 15 * 1024 * 1024) throw new HttpError(400, "File is larger than 15 MB");
    const text = await fileToText(file.name, file.type, Buffer.from(await file.arrayBuffer()));
    return json({ id: addText(s.workspaceId, String(form.get("title") || file.name), text, "file", file.name) });
  }
  const b = await req.json();
  if (b.url) {
    const page = await fetchPage(String(b.url));
    return json({ id: addText(s.workspaceId, b.title || page.title, page.text, "url", String(b.url)) });
  }
  if (!String(b.text ?? "").trim()) throw new HttpError(400, "Add some text or a link");
  return json({ id: addText(s.workspaceId, b.title || "Notes", String(b.text)) });
});
