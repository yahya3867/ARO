import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
const file = ".env.local";
let contents = "";
try {
  contents = readFileSync(file, "utf8");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const existing = contents.match(/^ARO_OPERATOR_KEY=(.+)$/m)?.[1].trim();
const key =
  process.env.ARO_OPERATOR_KEY ||
  existing ||
  randomBytes(24).toString("base64url");
if (!existing && !process.env.ARO_OPERATOR_KEY)
  appendFileSync(file, "\nARO_OPERATOR_KEY=" + key + "\n", { mode: 0o600 });
console.log("ARO operator key for this installation\n" + key);
