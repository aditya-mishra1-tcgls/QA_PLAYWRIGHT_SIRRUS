import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const databaseUrl = process.env.QA_DATABASE_URL;
const bucket = process.env.QA_S3_BUCKET;
const prefix = (process.env.QA_S3_PREFIX || "qa-playwright").replace(/^\/+|\/+$/g, "");

const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, ssl: process.env.QA_DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined }) : null;
const s3 = bucket ? new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: process.env.QA_S3_ENDPOINT || undefined,
  forcePathStyle: process.env.QA_S3_FORCE_PATH_STYLE === "true"
}) : null;

export const databaseEnabled = Boolean(pool);
export const objectStorageEnabled = Boolean(s3);

export async function initializePersistence() {
  if (!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS qa_test_runs (
    run_id TEXT PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL,
    payload JSONB NOT NULL
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS qa_test_runs_started_at_idx ON qa_test_runs (started_at DESC)");
}

export async function savePersistentRun(run) {
  if (!pool) return;
  await pool.query(`INSERT INTO qa_test_runs (run_id, started_at, updated_at, status, payload)
    VALUES ($1, $2, NOW(), $3, $4::jsonb)
    ON CONFLICT (run_id) DO UPDATE SET updated_at = NOW(), status = EXCLUDED.status, payload = EXCLUDED.payload`,
  [run.id, run.startedAt, run.status, JSON.stringify(run)]);
}

export async function loadPersistentRun(runId) {
  if (!pool) return null;
  const result = await pool.query("SELECT payload FROM qa_test_runs WHERE run_id = $1", [runId]);
  return result.rows[0]?.payload || null;
}

export async function listPersistentRuns() {
  if (!pool) return null;
  const result = await pool.query("SELECT payload FROM qa_test_runs ORDER BY started_at DESC");
  return result.rows.map((row) => row.payload);
}

function mimeType(filePath) {
  return {
    ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webm": "video/webm", ".zip": "application/zip", ".log": "text/plain"
  }[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const item = path.join(directory, entry);
    return statSync(item).isDirectory() ? filesUnder(item) : [item];
  });
}

export async function uploadRunArtifacts(runId, runDir) {
  if (!s3) return [];
  const files = filesUnder(runDir).filter((file) => path.basename(file) !== "run.json");
  const artifacts = [];
  for (const file of files) {
    const relativePath = path.relative(runDir, file).split(path.sep).join("/");
    const key = [prefix, "runs", runId, relativePath].filter(Boolean).join("/");
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: createReadStream(file), ContentType: mimeType(file) }));
    artifacts.push({ path: relativePath, key, contentType: mimeType(file) });
  }
  return artifacts;
}

export async function getRemoteArtifact(runId, relativePath) {
  if (!s3 || relativePath.includes("..")) return null;
  const key = [prefix, "runs", runId, relativePath].filter(Boolean).join("/");
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return { body: response.Body, contentType: response.ContentType || mimeType(relativePath) };
}

export async function closePersistence() {
  await pool?.end();
}
