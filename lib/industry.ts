import { metaCfg, saveMetaCfg } from "./metaleads";

export type Industry = "general" | "resort";
export type Business = { name?: string; location?: string; check_in_time?: string; check_out_time?: string };

const ALL_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
const PRESETS: Record<Industry, { stages: Record<string, string>; terms: { catalog: string; orders: string; order: string } }> = {
  general: { stages: { new: "New", contacted: "Contacted", qualified: "Qualified", proposal: "Proposal", won: "Won", lost: "Lost" }, terms: { catalog: "Catalog", orders: "Orders", order: "order" } },
  resort: { stages: { new: "Enquiry", contacted: "In conversation", qualified: "Quote sent", proposal: "Awaiting advance", won: "Booked", lost: "Lost" }, terms: { catalog: "Rooms & packages", orders: "Bookings", order: "booking" } },
};

export const getIndustry = (ws: string): Industry => (metaCfg(ws).industry === "resort" ? "resort" : "general");
export const getBusiness = (ws: string): Business => metaCfg(ws).business ?? {};
export const saveIndustry = (ws: string, industry: Industry, business?: Business) =>
  saveMetaCfg(ws, { ...metaCfg(ws), industry, business: { ...(metaCfg(ws).business ?? {}), ...(business ?? {}) } });
export const stagesFor = (ws: string) => ALL_STAGES.map((key) => ({ key, label: PRESETS[getIndustry(ws)].stages[key] }));
export const termsFor = (ws: string) => PRESETS[getIndustry(ws)].terms;
