import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash, createHmac } from "node:crypto";
import path from "node:path";
import { Pool } from "pg";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function loadDotEnv() {
  const envPath = path.resolve(".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || key in process.env) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadDotEnv();

const databaseUrl = process.env.QA_DATABASE_URL;
const bucket = process.env.QA_S3_BUCKET;
const prefix = (process.env.QA_S3_PREFIX || "qa-playwright").replace(/^\/+|\/+$/g, "");
const region = process.env.AWS_REGION || "us-east-1";
const endpoint = process.env.QA_S3_ENDPOINT || "";
const publicBaseUrl = (process.env.QA_S3_PUBLIC_BASE_URL || "").replace(/\/+$/g, "");
const databaseConnectionTimeoutMillis = Number(process.env.QA_DATABASE_CONNECTION_TIMEOUT_MS || 10000);
const presignedUrlExpiresSeconds = Number(process.env.QA_S3_PRESIGNED_URL_EXPIRES_SECONDS || 3600);
const maxPersistentRunPayloadBytes = Number(process.env.QA_DATABASE_MAX_RUN_PAYLOAD_BYTES || 15 * 1024 * 1024);

function databaseConfig() {
  if (!databaseUrl) return null;

  const parsed = new URL(databaseUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    connectionTimeoutMillis: databaseConnectionTimeoutMillis,
    ssl: process.env.QA_DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
  };
}

const pool = databaseUrl ? new Pool(databaseConfig()) : null;
const s3 = bucket ? new S3Client({
  region,
  endpoint: endpoint || undefined,
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
  await pool.query(`CREATE TABLE IF NOT EXISTS qa_dashboard_users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    app_credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    password_updated_at TIMESTAMPTZ
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS qa_dashboard_users_created_at_idx ON qa_dashboard_users (created_at DESC)");
}

function dashboardUserFromRow(row) {
  return {
    username: row.username,
    password: row.password,
    role: row.role || "user",
    appCredentials: row.app_credentials || {},
    createdAt: row.created_at?.toISOString?.() || row.created_at || null,
    passwordUpdatedAt: row.password_updated_at?.toISOString?.() || row.password_updated_at || null,
  };
}

export async function listPersistentDashboardUsers() {
  if (!pool) return null;
  const result = await pool.query(`SELECT username, password, role, app_credentials, created_at, password_updated_at
    FROM qa_dashboard_users
    ORDER BY created_at ASC, username ASC`);
  return result.rows.map(dashboardUserFromRow);
}

export async function insertPersistentDashboardUser(user) {
  if (!pool) return null;
  const result = await pool.query(`INSERT INTO qa_dashboard_users (username, password, role, app_credentials, created_at)
    VALUES ($1, $2, $3, $4::jsonb, $5)
    RETURNING username, password, role, app_credentials, created_at, password_updated_at`,
  [
    user.username,
    user.password,
    user.role || "user",
    JSON.stringify(user.appCredentials || {}),
    user.createdAt || new Date().toISOString(),
  ]);
  return dashboardUserFromRow(result.rows[0]);
}

export async function upsertPersistentDashboardUser(user) {
  if (!pool) return null;
  const result = await pool.query(`INSERT INTO qa_dashboard_users (username, password, role, app_credentials, created_at)
    VALUES ($1, $2, $3, $4::jsonb, $5)
    ON CONFLICT (username) DO UPDATE SET
      password = EXCLUDED.password,
      role = EXCLUDED.role,
      app_credentials = COALESCE(qa_dashboard_users.app_credentials, '{}'::jsonb) || EXCLUDED.app_credentials
    RETURNING username, password, role, app_credentials, created_at, password_updated_at`,
  [
    user.username,
    user.password,
    user.role || "user",
    JSON.stringify(user.appCredentials || {}),
    user.createdAt || new Date().toISOString(),
  ]);
  return dashboardUserFromRow(result.rows[0]);
}

export async function insertPersistentDashboardUserIfMissing(user) {
  if (!pool) return null;
  const result = await pool.query(`INSERT INTO qa_dashboard_users (username, password, role, app_credentials, created_at)
    VALUES ($1, $2, $3, $4::jsonb, $5)
    ON CONFLICT (username) DO NOTHING
    RETURNING username, password, role, app_credentials, created_at, password_updated_at`,
  [
    user.username,
    user.password,
    user.role || "user",
    JSON.stringify(user.appCredentials || {}),
    user.createdAt || new Date().toISOString(),
  ]);
  return result.rows[0] ? dashboardUserFromRow(result.rows[0]) : null;
}

export async function updatePersistentDashboardUserPassword(username, password) {
  if (!pool) return null;
  const result = await pool.query(`UPDATE qa_dashboard_users
    SET password = $2, password_updated_at = NOW()
    WHERE username = $1
    RETURNING username, password, role, app_credentials, created_at, password_updated_at`,
  [username, password]);
  return result.rows[0] ? dashboardUserFromRow(result.rows[0]) : null;
}

export async function deletePersistentDashboardUser(username) {
  if (!pool) return null;
  const result = await pool.query("DELETE FROM qa_dashboard_users WHERE username = $1 RETURNING username", [username]);
  return result.rows[0] || null;
}

export async function updatePersistentDashboardUserAppCredentials(username, appCredentials) {
  if (!pool) return null;
  const result = await pool.query(`UPDATE qa_dashboard_users
    SET app_credentials = $2::jsonb
    WHERE username = $1
    RETURNING username, password, role, app_credentials, created_at, password_updated_at`,
  [username, JSON.stringify(appCredentials || {})]);
  return result.rows[0] ? dashboardUserFromRow(result.rows[0]) : null;
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

  const sizeResult = await pool.query("SELECT pg_column_size(payload) AS payload_bytes FROM qa_test_runs WHERE run_id = $1", [runId]);
  const payloadBytes = Number(sizeResult.rows[0]?.payload_bytes || 0);
  if (!payloadBytes) return null;

  if (payloadBytes > maxPersistentRunPayloadBytes) {
    throw new Error(
      `Persistent run payload is ${payloadBytes} bytes, above the safe limit of ${maxPersistentRunPayloadBytes} bytes. ` +
      "Use the local run file or events log instead of loading this full DB payload."
    );
  }

  const result = await pool.query("SELECT payload FROM qa_test_runs WHERE run_id = $1", [runId]);
  return result.rows[0]?.payload || null;
}

export async function listPersistentRuns() {
  if (!pool) return null;
  const result = await pool.query(`SELECT jsonb_build_object(
    'id', payload->>'id',
    'status', status,
    'startedAt', payload->>'startedAt',
    'endedAt', payload->>'endedAt',
    'options', payload->'options',
    'summary', payload->'summary',
    'expectedTotal', payload->'expectedTotal'
  ) AS payload
  FROM qa_test_runs
  ORDER BY started_at DESC
  LIMIT 20`);
  return result.rows.map((row) => row.payload);
}

export async function listPersistentRunSummaries() {
  if (!pool) return null;
  const result = await pool.query(`SELECT jsonb_build_object(
    'id', payload->>'id',
    'status', status,
    'startedAt', payload->>'startedAt',
    'endedAt', payload->>'endedAt',
    'options', payload->'options',
    'summary', payload->'summary',
    'expectedTotal', payload->'expectedTotal'
  ) AS payload
  FROM qa_test_runs
  ORDER BY started_at DESC
  LIMIT 20`);
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

function encodeKey(key) {
  return key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function hmac(key, value, encoding) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function signingKey(secretAccessKey, dateStamp) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function s3ObjectUrl(key) {
  const encodedKey = encodeKey(key);
  if (endpoint) {
    const normalizedEndpoint = endpoint.replace(/\/+$/g, "");
    return process.env.QA_S3_FORCE_PATH_STYLE === "true"
      ? new URL(`${normalizedEndpoint}/${encodeURIComponent(bucket)}/${encodedKey}`)
      : new URL(`${normalizedEndpoint}/${encodedKey}`);
  }

  return new URL(`https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`);
}

export function createArtifactPublicUrl(key) {
  if (!bucket || !key) return "";
  return publicBaseUrl ? `${publicBaseUrl}/${encodeKey(key)}` : s3ObjectUrl(key).toString();
}

export function createPresignedGetUrl(key, expiresSeconds = presignedUrlExpiresSeconds) {
  if (!bucket || !key) return "";

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  if (!accessKeyId || !secretAccessKey) {
    return "";
  }

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const url = s3ObjectUrl(key);
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.max(1, Math.min(Number(expiresSeconds) || 3600, 604800))),
    "X-Amz-SignedHeaders": "host"
  });

  if (sessionToken) {
    query.set("X-Amz-Security-Token", sessionToken);
  }

  const canonicalQueryString = [...query.entries()]
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .sort()
    .join("&");
  const canonicalRequest = [
    "GET",
    url.pathname,
    canonicalQueryString,
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest)
  ].join("\n");
  const signature = hmac(signingKey(secretAccessKey, dateStamp), stringToSign, "hex");
  url.search = `${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return url.toString();
}

export async function uploadRunArtifacts(runId, runDir) {
  if (!s3) return [];
  const files = filesUnder(runDir).filter((file) => path.basename(file) !== "run.json");
  const artifacts = [];
  for (const file of files) {
    const relativePath = path.relative(runDir, file).split(path.sep).join("/");
    const artifact = await uploadRunArtifact(runId, runDir, relativePath);
    if (artifact) {
      artifacts.push(artifact);
    }
  }
  return artifacts;
}

export async function uploadRunArtifact(runId, runDir, relativePath) {
  if (!s3 || !relativePath || relativePath.includes("..")) return null;
  const file = path.join(runDir, relativePath);
  if (!existsSync(file) || statSync(file).isDirectory()) return null;

  const key = [prefix, "runs", runId, relativePath].filter(Boolean).join("/");
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: createReadStream(file), ContentLength: statSync(file).size, ContentType: mimeType(file) }));
  return { path: relativePath, key, contentType: mimeType(file) };
}

export async function getRemoteArtifact(runId, relativePath) {
  if (!s3 || relativePath.includes("..")) return null;
  const key = [prefix, "runs", runId, relativePath].filter(Boolean).join("/");
  return getRemoteArtifactByKey(key, relativePath);
}

export async function getRemoteArtifactByKey(key, fallbackPath = "") {
  if (!s3 || !key || key.includes("..")) return null;
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return { body: response.Body, contentType: response.ContentType || mimeType(fallbackPath || key) };
  } catch (error) {
    if (["AccessDenied", "NoSuchKey", "NotFound"].includes(error?.name || error?.Code)) {
      return null;
    }
    throw error;
  }
}

export async function closePersistence() {
  await pool?.end();
}
