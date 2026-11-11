import path from "node:path";
import { fileURLToPath } from "node:url";

const security = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

/** @type {import('next').NextConfig} */
export default {
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: security }];
  },
};
