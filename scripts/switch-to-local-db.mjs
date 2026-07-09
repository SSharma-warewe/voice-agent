import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const text = fs.readFileSync(envPath, "utf8");
const lines = text.split(/\r?\n/);

let changed = false;
const out = [];

if (!text.includes("LOCAL DB isolation")) {
  out.push(
    "# LOCAL DB isolation: voice_repo_local (deployment/Railway must keep neondb)",
  );
}

for (const line of lines) {
  if (line.startsWith("DATABASE_URL=")) {
    if (line.includes("/voice_repo_local")) {
      out.push(line);
      continue;
    }
    const next = line
      .replace("/neondb?", "/voice_repo_local?")
      .replace("/neondb&", "/voice_repo_local&")
      .replace(/\/neondb$/, "/voice_repo_local");
    if (next === line) {
      throw new Error("Could not rewrite DATABASE_URL path to voice_repo_local");
    }
    out.push(next);
    changed = true;
    continue;
  }
  out.push(line);
}

if (!changed && !text.includes("/voice_repo_local")) {
  throw new Error("DATABASE_URL not updated");
}

fs.writeFileSync(envPath, out.join("\n"));

const match = fs
  .readFileSync(envPath, "utf8")
  .match(/^DATABASE_URL=.*\/([^?\s]+)/m);
console.log("DATABASE_URL database name now:", match?.[1] || "unknown");
