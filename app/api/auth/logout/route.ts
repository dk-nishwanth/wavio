import { json } from "@/lib/http";

export async function POST() {
  const res = json({ ok: true });
  res.cookies.set("session", "", { path: "/", maxAge: 0 });
  return res;
}
