export const isProd = () => process.env.NODE_ENV === "production";
/** Simulators and test checkouts are for development; production needs ALLOW_DEV_TOOLS=1 to expose them. */
export const devToolsEnabled = () => !isProd() || process.env.ALLOW_DEV_TOOLS === "1";

const WEAK = new Set(["", "change-me", "dev-secret", "secret", "password"]);

/** Called once at server start. In production the app refuses to boot with placeholder secrets. */
export function assertProdConfig() {
  if (!isProd()) return;
  const problems: string[] = [];
  if (WEAK.has(process.env.APP_SECRET ?? "") || (process.env.APP_SECRET ?? "").length < 32) problems.push("APP_SECRET must be a random string of 32+ characters");
  if (WEAK.has(process.env.CRON_SECRET ?? "")) problems.push("CRON_SECRET must be set to a random value");
  if (!process.env.APP_URL || process.env.APP_URL.startsWith("http://localhost")) problems.push("APP_URL must be your public https address");
  if (problems.length) throw new Error("Unsafe production configuration:\n - " + problems.join("\n - "));
}
