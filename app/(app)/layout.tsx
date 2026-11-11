import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth";
import Nav from "@/components/Nav";
import { termsFor } from "@/lib/industry";
import { plansEnforced } from "@/lib/billing";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  return (
    <div className="shell">
      <Nav name={s.name} terms={termsFor(s.workspaceId)} showBilling={plansEnforced()} />
      <main className="main">{children}</main>
    </div>
  );
}
