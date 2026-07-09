/**
 * Create an isolated local database on the same Neon project so local runs
 * never mutate the deployment database (typically `neondb`).
 *
 * Usage: node scripts/ensure-local-db.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Load root .env without dotenv dependency
const envPath = path.join(root, ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = value;
}

// Resolve pg from the worker package
const require = createRequire(path.join(root, "packages/worker/package.json"));
const pg = require("pg");

const LOCAL_DB = process.env.LOCAL_DATABASE_NAME || "voice_repo_local";
const sourceUrl = process.env.DATABASE_URL;

if (!sourceUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const url = new URL(sourceUrl);
const currentDb = decodeURIComponent(url.pathname.replace(/^\//, "")) || "neondb";

console.log(`Host: ${url.hostname}`);
console.log(`Current DATABASE_URL db: ${currentDb}`);
console.log(`Local isolated db name: ${LOCAL_DB}`);

if (currentDb === LOCAL_DB) {
  console.log("Already on local database. OK.");
  process.exit(0);
}

const admin = new pg.Client({
  connectionString: sourceUrl,
  ssl: sourceUrl.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});

await admin.connect();

const existing = await admin.query(
  "SELECT 1 FROM pg_database WHERE datname = $1",
  [LOCAL_DB],
);

if (existing.rowCount === 0) {
  // Identifiers cannot be parameterized in CREATE DATABASE
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(LOCAL_DB)) {
    throw new Error(`Unsafe LOCAL_DATABASE_NAME: ${LOCAL_DB}`);
  }
  await admin.query(`CREATE DATABASE ${LOCAL_DB}`);
  console.log(`Created database: ${LOCAL_DB}`);
} else {
  console.log(`Database already exists: ${LOCAL_DB}`);
}

await admin.end();

url.pathname = `/${LOCAL_DB}`;
console.log("\nLOCAL_DATABASE_URL=");
console.log(url.toString());
