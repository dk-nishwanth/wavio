import fs from "node:fs";
import path from "node:path";
import { get, run } from "./db";
import { downloadMedia, waConfig } from "./wa";
import { HttpError } from "./auth";

/** Media is stored on local disk next to the database (data/media). Move to object storage when you outgrow one server. */
export const mediaRoot = () => path.resolve(process.env.MEDIA_DIR || path.join(path.dirname(process.env.DATABASE_PATH || "./data/app.db"), "media"));

export type Kind = "image" | "video" | "audio" | "document";
const MIME: Record<string, { kind: Kind; ext: string; max: number }> = {
  "image/jpeg": { kind: "image", ext: "jpg", max: 5 }, "image/png": { kind: "image", ext: "png", max: 5 }, "image/webp": { kind: "image", ext: "webp", max: 5 },
  "video/mp4": { kind: "video", ext: "mp4", max: 16 }, "video/3gpp": { kind: "video", ext: "3gp", max: 16 },
  "audio/mpeg": { kind: "audio", ext: "mp3", max: 16 }, "audio/ogg": { kind: "audio", ext: "ogg", max: 16 }, "audio/aac": { kind: "audio", ext: "aac", max: 16 }, "audio/mp4": { kind: "audio", ext: "m4a", max: 16 }, "audio/amr": { kind: "audio", ext: "amr", max: 16 },
  "application/pdf": { kind: "document", ext: "pdf", max: 16 }, "text/plain": { kind: "document", ext: "txt", max: 16 },
  "application/msword": { kind: "document", ext: "doc", max: 16 }, "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { kind: "document", ext: "docx", max: 16 },
  "application/vnd.ms-excel": { kind: "document", ext: "xls", max: 16 }, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { kind: "document", ext: "xlsx", max: 16 },
  "application/vnd.ms-powerpoint": { kind: "document", ext: "ppt", max: 16 }, "application/vnd.openxmlformats-officedocument.presentationml.presentation": { kind: "document", ext: "pptx", max: 16 },
};

/** Validates an outgoing upload against what WhatsApp accepts. */
export function checkUpload(mime: string, size: number) {
  const m = MIME[mime.split(";")[0].trim().toLowerCase()];
  if (!m) throw new HttpError(400, `Unsupported file type (${mime || "unknown"}). Use JPG/PNG, MP4, MP3/OGG/AAC, PDF or Office documents.`);
  if (size > m.max * 1024 * 1024) throw new HttpError(400, `${m.kind === "image" ? "Images" : "Files"} of this type can be at most ${m.max} MB`);
  if (size === 0) throw new HttpError(400, "The file is empty");
  return m;
}
export const extFor = (mime: string) => MIME[mime.split(";")[0].trim().toLowerCase()]?.ext ?? "bin";

export function saveFile(ws: string, messageId: string, ext: string, bytes: Buffer): string {
  const rel = path.join(ws, `${messageId}.${ext.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "bin"}`);
  const full = path.join(mediaRoot(), rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, bytes);
  return rel;
}

/** Resolves a stored relative path, refusing anything that escapes the media folder. */
export function resolveMedia(rel: string): string {
  const full = path.resolve(mediaRoot(), rel);
  if (!full.startsWith(mediaRoot() + path.sep)) throw new HttpError(400, "Bad media path");
  return full;
}

/** Job: pull a customer's photo/voice note/document from Meta onto our disk. */
export async function fetchInboundMedia(messageId: string) {
  const m = get<any>("SELECT * FROM messages WHERE id=?", messageId);
  if (!m || !m.media_id || m.media_path) return;
  const cfg = waConfig(m.workspace_id);
  if (!cfg.token) return; // test mode: nothing to download
  const { bytes, mime } = await downloadMedia(cfg, m.media_id);
  if (bytes.length > 64 * 1024 * 1024) throw Object.assign(new Error("Media too large to store"), { permanent: true });
  const rel = saveFile(m.workspace_id, messageId, extFor(mime || m.media_mime || ""), bytes);
  run("UPDATE messages SET media_path=?, media_mime=? WHERE id=?", rel, mime || m.media_mime, messageId);
}
