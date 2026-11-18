import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { recentAudit } from "@/lib/audit";

export const GET = handle(async () => json(recentAudit((await requireSession()).workspaceId)));
