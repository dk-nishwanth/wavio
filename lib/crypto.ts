import crypto from "node:crypto";

const PREFIX = "enc1:";

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || process.env.APP_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-secret");
  if (!raw) throw new Error("ENCRYPTION_KEY or APP_SECRET must be set");
  return crypto.createHash("sha256").update("wavio-secrets:" + raw).digest();
}

/** AES-256-GCM. Stored as "enc1:" + base64(iv | tag | ciphertext). */
export function encrypt(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  if (plain.startsWith(PREFIX)) return plain;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

/** Reads encrypted values; rows written before encryption existed (no prefix) pass through. */
export function decrypt(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return null;
  if (!stored.startsWith(PREFIX)) return stored;
  const buf = Buffer.from(stored.slice(PREFIX.length), "base64");
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch {
    throw new Error("Could not decrypt a stored secret — ENCRYPTION_KEY/APP_SECRET changed since it was saved");
  }
}
