// Renders the PWA/home-screen icons from public/logo-mark.svg. Usage: npm run icons
import sharp from "sharp";
import fs from "node:fs";

const svg = fs.readFileSync("public/logo-mark.svg");
async function main() {
  for (const size of [192, 512]) await sharp(svg, { density: 384 }).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(`public/icon-${size}.png`);
  // maskable: the mark sits in the middle 60% on a solid brand square so phones can crop it to any shape
  for (const size of [192, 512]) {
    const inner = await sharp(svg, { density: 384 }).resize(Math.round(size * 0.6), Math.round(size * 0.6)).png().toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: "#063b26" } }).composite([{ input: inner, gravity: "center" }]).png().toFile(`public/icon-maskable-${size}.png`);
  }
  const inner = await sharp(svg, { density: 384 }).resize(120, 120).png().toBuffer();
  await sharp({ create: { width: 180, height: 180, channels: 4, background: "#063b26" } }).composite([{ input: inner, gravity: "center" }]).png().toFile("public/apple-touch-icon.png");
  console.log("icons written to public/");
}
main();
