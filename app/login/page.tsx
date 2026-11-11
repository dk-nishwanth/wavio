"use client";
import { useState } from "react";
import { api } from "@/components/api";

export default function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [f, setF] = useState({ name: "", workspace: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    try { await api(`/api/auth/${mode}`, "POST", f); location.href = "/home"; } catch (x: any) { setErr(x.message); }
  }
  return (
    <div className="auth-wrap"><form className="auth card" onSubmit={submit}>
      <div className="brand"><img src="/logo-mark.svg" alt="" />wavio</div>
      <p className="muted" style={{ textAlign: "center" }}>{mode === "login" ? "Sign in to your workspace" : "Create your workspace"}</p>
      {mode === "signup" && (<><label>Your name</label><input value={f.name} onChange={set("name")} required /><label>Workspace / company</label><input value={f.workspace} onChange={set("workspace")} required /></>)}
      <label>{mode === "login" ? "Email or username" : "Email"}</label><input type={mode === "login" ? "text" : "email"} value={f.email} onChange={set("email")} required />
      <label>Password</label><input type="password" value={f.password} onChange={set("password")} minLength={8} required />
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
      <button className="btn mt" style={{ width: "100%", justifyContent: "center" }}>{mode === "login" ? "Sign in" : "Create account"}</button>
      <p className="small muted mt" style={{ textAlign: "center", cursor: "pointer" }} onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "No account? Sign up" : "Have an account? Sign in"}
      </p>
    </form></div>
  );
}
