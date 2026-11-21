import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
await mkdir(path.join(root, "site/public/landing"), { recursive: true });
for (const file of ["aro-demo.mp4", "aro-poster.png"])
  await copyFile(path.join(root, "public/landing", file), path.join(root, "site/public/landing", file));
await copyFile(path.join(root, "src/app/icon.svg"), path.join(root, "site/app/icon.svg"));
await copyFile(path.join(root, "public/aro_cover.png"), path.join(root, "site/app/opengraph-image.png"));
await sharp(path.join(root, "src/app/icon.svg")).resize(180, 180).png().toFile(path.join(root, "site/app/apple-icon.png"));
const result = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build", "site"], { cwd: root, env: process.env, stdio: "inherit" });
process.exit(result.status ?? 1);
