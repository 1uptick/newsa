#!/usr/bin/env node
/**
 * Converts all PNG/JPEG images in public/ to WebP.
 * Run: node scripts/convert-images-to-webp.mjs
 * Options: --replace = delete originals after conversion
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const EXTENSIONS = [".png", ".jpg", ".jpeg"];
const REPLACE = process.argv.includes("--replace");

function findImages(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      findImages(full, files);
    } else if (EXTENSIONS.includes(path.extname(e.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

async function convertWithSharp(sharp, inputPath) {
  const ext = path.extname(inputPath);
  const base = inputPath.slice(0, -ext.length);
  const outputPath = base + ".webp";
  await sharp(inputPath)
    .webp({ quality: 85, effort: 4 })
    .toFile(outputPath);
  if (REPLACE) {
    fs.unlinkSync(inputPath);
    console.log("Converted (replaced):", path.relative(PUBLIC_DIR, inputPath), "->", path.basename(outputPath));
  } else {
    console.log("Converted:", path.relative(PUBLIC_DIR, inputPath), "->", path.basename(outputPath));
  }
  return outputPath;
}

async function main() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    console.error("public/ directory not found");
    process.exit(1);
  }
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch (e) {
    console.error("Install sharp: npm install --save-dev sharp");
    process.exit(1);
  }
  const images = findImages(PUBLIC_DIR);
  if (images.length === 0) {
    console.log("No PNG/JPEG images found in public/");
    return;
  }
  console.log("Converting", images.length, "image(s) to WebP...");
  for (const img of images) {
    try {
      await convertWithSharp(sharp, img);
    } catch (err) {
      console.error("Failed:", img, err.message);
    }
  }
  console.log("Done.");
}

main();
