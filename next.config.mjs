import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
export default {
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
};
