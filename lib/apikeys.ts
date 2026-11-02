import crypto from "node:crypto";
import { get, id, now, run } from "./db";
import { HttpError, sha256 } from "./auth";

export function createKey(ws: string, kind: "public" | "secret", label: string, origins: string[] = []) {
  const raw = (kind === "public" ? "pk_live_" : "sk_live_") + crypto.randomBytes(24).toString("base64url");
  run(
    "INSERT INTO api_keys (id, workspace_id, kind, label, key_hash, key_prefix, allowed_origins, created_at) VALUES (?,?,?,?,?,?,?,?)",
    id("k_"), ws, kind, label, sha256(raw), raw.slice(0, 12), JSON.stringify(origins), now(),
  );
  return raw; // shown once, only the hash is stored
}

export const CORS_HEADERS = (origin: string | null): Record<string, string> => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Api-Key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  Vary: "Origin",
});

/** Authenticates a v1 API request. Public keys are limited to allowed origins and to the scopes the route permits. */
export function authApiKey(req: Request, allow: ("public" | "secret")[]) {
  const h = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("x-api-key") ?? "";
  if (!h) throw new HttpError(401, "Missing API key");
  const key = get<any>("SELECT * FROM api_keys WHERE key_hash=?", sha256(h));
  if (!key) throw new HttpError(401, "Invalid API key");
  if (!allow.includes(key.kind)) throw new HttpError(403, `A ${key.kind} key cannot call this endpoint`);
  if (key.kind === "public") {
    const origins: string[] = JSON.parse(key.allowed_origins);
    const origin = req.headers.get("origin");
    if (origins.length && (!origin || !origins.includes(origin))) throw new HttpError(403, "Origin not allowed for this key");
  }
  return { workspaceId: key.workspace_id as string, kind: key.kind as "public" | "secret" };
}
