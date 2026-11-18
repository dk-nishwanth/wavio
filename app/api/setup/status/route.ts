import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { setupStatus } from "@/lib/setup";

export const GET = handle(async () => json(setupStatus((await requireSession()).workspaceId)));
