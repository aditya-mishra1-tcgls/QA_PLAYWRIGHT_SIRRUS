import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { appendFile, copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseEnabled, getRemoteArtifact, initializePersistence, listPersistentRunSummaries, listPersistentRuns, loadPersistentRun, objectStorageEnabled, savePersistentRun, uploadRunArtifact, uploadRunArtifacts } from "./persistence.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const dashboardDir = path.join(rootDir, "dashboard");
const runsRoot = path.join(rootDir, "data", "test-runs");
const eventPrefix = "@@QA_DASHBOARD_EVENT@@";
const maxStoredEvents = 500;
const maxStoredSteps = 120;
const activeRuns = new Map();
const saveQueues = new Map();

mkdirSync(runsRoot, { recursive: true });

function readJson(relativePath, fallback) {
  const filePath = path.join(rootDir, relativePath);
  if (!existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

function listSpecFiles(baseDir = path.join(rootDir, "tests", "flows")) {
  if (!existsSync(baseDir)) {
    return [];
  }

  return readdirSync(baseDir).flatMap((entry) => {
    const entryPath = path.join(baseDir, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      return listSpecFiles(entryPath);
    }

    return entry.endsWith(".spec.ts")
      ? [path.relative(rootDir, entryPath)]
      : [];
  });
}

function listFlowFolders() {
  const flowsDir = path.join(rootDir, "tests", "flows");
  if (!existsSync(flowsDir)) {
    return [];
  }

  return readdirSync(flowsDir)
    .filter((entry) => statSync(path.join(flowsDir, entry)).isDirectory())
    .sort();
}

function getConfig() {
  const environments = readJson("config/environments.json", { default: "", environments: {} });
  const profiles = readJson("config/execution-profiles.json", { defaultMode: "", modes: {} });

  return {
    environments,
    profiles,
    flows: listFlowFolders(),
    specFiles: listSpecFiles(),
    projects: ["chromium", "setup"]
  };
}

function safeRunId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]/g, "");
}

function createRunId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function getRunDir(runId) {
  return path.join(runsRoot, safeRunId(runId));
}

function temporaryRunPath(runPath) {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${runPath}.${suffix}.tmp`;
}

function extractLastCompleteRunJson(content) {
  let depth = 0;
  let start = -1;
  let quoted = false;
  let escaped = false;
  let latest = null;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try { latest = JSON.parse(content.slice(start, index + 1)); } catch {}
        start = -1;
      }
    }
  }
  return latest;
}

async function recoverRunFile(runPath, runId) {
  const content = await readFile(runPath, "utf8");
  try {
    return JSON.parse(content);
  } catch {}

  const recovered = extractLastCompleteRunJson(content);
  if (!recovered?.id) {
    console.warn(`Could not recover corrupt local run ${runId}.`);
    return null;
  }

  const backupPath = `${runPath}.corrupt-backup`;
  if (!existsSync(backupPath)) await copyFile(runPath, backupPath);
  const temporaryPath = temporaryRunPath(runPath);
  await writeFile(temporaryPath, `${JSON.stringify(recovered, null, 2)}\n`);
  await rename(temporaryPath, runPath);
  console.warn(`Recovered local run ${runId}; saved its original file as ${path.basename(backupPath)}.`);
  return recovered;
}

async function recoverCorruptedRunFiles() {
  if (!existsSync(runsRoot)) return;
  for (const entry of readdirSync(runsRoot)) {
    const runPath = path.join(runsRoot, entry, "run.json");
    if (!existsSync(runPath)) continue;
    await recoverRunFile(runPath, entry);
  }
}

async function syncLocalRunsToDatabase() {
  if (!databaseEnabled || !existsSync(runsRoot)) return;

  for (const entry of readdirSync(runsRoot)) {
    const runPath = path.join(runsRoot, entry, "run.json");
    if (!existsSync(runPath)) continue;

    const run = await recoverRunFile(runPath, entry);
    if (!run) continue;

    await preserveRunAttachments(run);
    applyUploadedArtifactUrls(run);
    recomputeRunSummary(run);
    await savePersistentRun(run);
  }
}

async function readRun(runId) {
  const runPath = path.join(getRunDir(runId), "run.json");
  let run;
  if (databaseEnabled) {
    run = await loadPersistentRun(runId);
    if (!run) throw new Error("Run not found");
  } else if (existsSync(runPath)) {
    run = await recoverRunFile(runPath, runId);
    if (!run) throw new Error("Run file is corrupt and could not be recovered");
  } else {
    run = await loadPersistentRun(runId);
    if (!run) throw new Error("Run not found");
  }
  if (await preserveRunAttachments(run)) {
    await saveRun(run);
  }
  if (applyUploadedArtifactUrls(run)) {
    await saveRun(run);
  }
  recomputeRunSummary(run);
  return run;
}

function trimRunForUi(run) {
  run.events = (run.events || []).slice(-maxStoredEvents);
  for (const test of Object.values(run.tests || {})) {
    test.steps = (test.steps || []).slice(-maxStoredSteps);
    if (test.retry?.steps) {
      test.retry.steps = test.retry.steps.slice(-maxStoredSteps);
    }
  }
}

async function saveRun(run) {
  trimRunForUi(run);
  const serializedRun = `${JSON.stringify(run, null, 2)}\n`;
  const persistedRun = JSON.parse(serializedRun);
  const previous = saveQueues.get(run.id) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    const runPath = path.join(getRunDir(run.id), "run.json");
    const temporaryPath = temporaryRunPath(runPath);
    await writeFile(temporaryPath, serializedRun);
    await rename(temporaryPath, runPath);
    await savePersistentRun(persistedRun);
  });
  saveQueues.set(run.id, task);
  try { await task; } finally { if (saveQueues.get(run.id) === task) saveQueues.delete(run.id); }
}

async function archiveRun(run) {
  if (!objectStorageEnabled) return;
  try {
    await preserveRunAttachments(run);
    run.artifacts = await uploadRunArtifacts(run.id, getRunDir(run.id));
    applyUploadedArtifactUrls(run);
    run.archivedAt = new Date().toISOString();
    run.archiveError = null;
  } catch (error) {
    run.archiveError = error.message || "S3 artifact upload failed";
    run.events = run.events || [];
    run.events.push({
      type: "log",
      source: "dashboard",
      timestamp: new Date().toISOString(),
      text: `S3 artifact upload failed: ${run.archiveError}`
    });
  }
  await saveRun(run);
}

function safeFileSegment(value) {
  return String(value || "attachment").replace(/[^a-zA-Z0-9._-]/g, "-");
}

function resolveAttachmentSource(attachmentPath) {
  if (!attachmentPath) {
    return null;
  }

  const candidates = path.isAbsolute(attachmentPath)
    ? [attachmentPath]
    : [
        path.resolve(rootDir, attachmentPath),
        path.resolve(attachmentPath)
      ];

  return candidates.find((candidate) => existsSync(candidate) && !statSync(candidate).isDirectory()) || null;
}

async function preserveAttachments(run, event) {
  const attachments = event.attachments || [];
  const targetDir = path.join(getRunDir(run.id), "artifacts", safeFileSegment(event.testId));
  const stored = [];
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    const sourcePath = resolveAttachmentSource(attachment.path);
    if (!sourcePath) {
      stored.push(attachment);
      continue;
    }
    await mkdir(targetDir, { recursive: true });
    const extension = path.extname(sourcePath) || ".bin";
    const name = `${String(index + 1).padStart(2, "0")}-${safeFileSegment(attachment.name)}${extension}`;
    const destination = path.join(targetDir, name);
    if (path.resolve(sourcePath) !== path.resolve(destination)) {
      await copyFile(sourcePath, destination);
    }
    stored.push({
      ...attachment,
      path: path.relative(rootDir, destination).split(path.sep).join("/")
    });
  }
  return stored;
}

async function preserveRunAttachments(run) {
  let changed = false;

  for (const test of Object.values(run.tests || {})) {
    if (!Array.isArray(test.attachments) || !test.attachments.length) {
      continue;
    }

    const normalized = await preserveAttachments(run, {
      testId: test.testId,
      attachments: test.attachments
    });

    if (JSON.stringify(normalized) !== JSON.stringify(test.attachments)) {
      test.attachments = normalized;
      changed = true;
    }
  }

  return changed;
}

function applyUploadedArtifactUrls(run) {
  const artifactsByPath = new Map((run.artifacts || []).map((artifact) => [artifact.path, artifact]));
  let changed = false;

  for (const test of Object.values(run.tests || {})) {
    if (!Array.isArray(test.attachments)) {
      continue;
    }

    for (const attachment of test.attachments) {
      const relativePath = attachment.path?.startsWith("data/test-runs/")
        ? attachment.path.split("/").slice(3).join("/")
        : attachment.path;
      const artifact = artifactsByPath.get(relativePath);
      if (artifact?.url && attachment.url !== artifact.url) {
        attachment.url = artifact.url;
        attachment.s3Key = artifact.key;
        changed = true;
      }
    }
  }

  return changed;
}

function runRelativeAttachmentPath(run, attachment) {
  if (!attachment?.path) {
    return null;
  }

  const runPrefix = `data/test-runs/${run.id}/`;
  if (attachment.path.startsWith(runPrefix)) {
    return attachment.path.slice(runPrefix.length);
  }

  const runDir = getRunDir(run.id);
  const absolutePath = path.resolve(rootDir, attachment.path);
  const relativePath = path.relative(runDir, absolutePath);
  return relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
    ? relativePath.split(path.sep).join("/")
    : null;
}

async function uploadStoredAttachments(run, attachments) {
  if (!objectStorageEnabled || !Array.isArray(attachments) || !attachments.length) {
    return [];
  }

  run.artifacts = run.artifacts || [];
  const artifactsByPath = new Map(run.artifacts.map((artifact) => [artifact.path, artifact]));
  const uploaded = [];

  for (const attachment of attachments) {
    const relativePath = runRelativeAttachmentPath(run, attachment);
    if (!relativePath || attachment.url) {
      continue;
    }

    let artifact = artifactsByPath.get(relativePath);
    if (!artifact) {
      try {
        artifact = await uploadRunArtifact(run.id, getRunDir(run.id), relativePath);
      } catch (error) {
        attachment.uploadError = error.message || "S3 upload failed";
        run.archiveError = attachment.uploadError;
        continue;
      }
    }
    if (!artifact) {
      continue;
    }

    if (!artifactsByPath.has(relativePath)) {
      run.artifacts.push(artifact);
      artifactsByPath.set(relativePath, artifact);
    }

    attachment.url = artifact.url;
    attachment.s3Key = artifact.key;
    uploaded.push(artifact);
  }

  return uploaded;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function contentTypeForPath(filePath) {
  return {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webm": "video/webm",
    ".zip": "application/zip",
    ".md": "text/markdown",
    ".log": "text/plain"
  }[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function killRunProcess(child) {
  if (!child.pid) {
    return false;
  }

  try {
    if (process.platform !== "win32") {
      process.kill(-child.pid, "SIGTERM");
      setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }, 5000).unref();
      return true;
    }

    child.kill("SIGTERM");
    return true;
  } catch {
    try {
      child.kill("SIGTERM");
      return true;
    } catch {
      return false;
    }
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function normalizeFlows(config, body) {
  if (Array.isArray(body.flows) && body.flows.length) {
    return body.flows;
  }

  const modeName = body.mode || config.profiles.defaultMode;
  return config.profiles.modes?.[modeName]?.flows || [];
}

function buildPlaywrightArgs(run) {
  const args = ["playwright", "test"];
  const selectedFiles = Array.isArray(run.options.specFiles) && run.options.specFiles.length
    ? run.options.specFiles
    : run.options.flows.map((flow) => path.join("tests", "flows", flow));

  args.push(...selectedFiles);
  args.push(`--reporter=list,${path.join("scripts", "dashboard", "reporter.mjs")}`);

  if (run.options.project) {
    args.push(`--project=${run.options.project}`);
  }

  if (run.options.grep) {
    args.push(`--grep=${run.options.grep}`);
  }

  if (run.options.workers) {
    args.push(`--workers=${run.options.workers}`);
  }

  if (run.options.retries !== undefined && run.options.retries !== "") {
    args.push(`--retries=${run.options.retries}`);
  }

  if (run.options.headed) {
    args.push("--headed");
  }

  if (run.options.debug) {
    args.push("--debug");
  }

  if (run.options.noDeps) {
    args.push("--no-deps");
  }

  return args;
}

function getRelativeTestTarget(test) {
  if (!test?.file) {
    return "";
  }

  const filePath = path.isAbsolute(test.file) ? path.relative(rootDir, test.file) : test.file;
  return test.line ? `${filePath}:${test.line}` : filePath;
}

function testMatchesTarget(event, target) {
  const eventFile = event?.file ? path.resolve(event.file) : "";
  const targetFile = target?.file ? path.resolve(rootDir, path.isAbsolute(target.file) ? path.relative(rootDir, target.file) : target.file) : "";
  return eventFile === targetFile && Number(event.line || 0) === Number(target.line || 0);
}

function recomputeRunSummary(run) {
  const tests = Object.values(run.tests || {});
  const summary = {};
  for (const test of tests) {
    const isCurrentTest = run.currentTestId && run.currentTestId === test.testId;
    if (!isCurrentTest && ["running", "retrying"].includes(test.status) && (!run.currentTestId || test.expectedStatus === "skipped")) {
      test.status = "skipped";
    }

    const isActiveCurrentTest = run.currentTestId && run.currentTestId === test.testId && ["running", "retrying"].includes(test.status);
    const isTerminalTest = ["passed", "failed", "timedOut", "interrupted", "skipped"].includes(test.status);
    if (isTerminalTest || isActiveCurrentTest) {
      summary[test.status] = (summary[test.status] || 0) + 1;
    }
  }

  run.summary = summary;
  const expectedTotal = run.expectedTotal || run.expectedTests?.length || tests.length;
  const completed = tests.filter((test) => ["passed", "failed", "timedOut", "interrupted", "skipped"].includes(test.status)).length;
  const failed = tests.some((test) => ["failed", "timedOut", "interrupted"].includes(test.status));
  const active = tests.some((test) => ["running", "retrying"].includes(test.status) && run.currentTestId === test.testId);

  if (expectedTotal > 0 && completed >= expectedTotal && !failed && !active) {
    run.status = "passed";
  } else if (failed && !active) {
    run.status = "failed";
  }
}

function rememberPreviousAttempt(test) {
  if (!test || test.status === "retrying") {
    return;
  }

  test.attempts = test.attempts || [];
  test.attempts.push({
    status: test.status,
    duration: test.duration,
    errors: test.errors || [],
    steps: test.steps || [],
    endedAt: test.endedAt || null
  });
}

async function appendRetryEvent(run, retry, event) {
  await appendFile(path.join(getRunDir(run.id), "events.ndjson"), `${JSON.stringify(event)}\n`);
  run.events.push(event);

  const targetTest = run.tests[retry.testId];
  if (!targetTest) {
    broadcast(run.id, event);
    return;
  }

  if (event.type === "test_begin" && testMatchesTarget(event, retry.target)) {
    rememberPreviousAttempt(targetTest);
    targetTest.status = "retrying";
    targetTest.errors = [];
    targetTest.retry = {
      id: retry.id,
      status: "running",
      startedAt: event.timestamp,
      steps: []
    };
    run.currentTestId = retry.testId;
    run.status = "retrying";
    broadcast(run.id, { type: "test_update", timestamp: event.timestamp, testId: retry.testId, test: targetTest, runStatus: run.status, summary: run.summary });
    return;
  }

  if (event.type === "step_begin" && targetTest.retry) {
    targetTest.retry.steps.push({ ...event, status: "running", startedAt: event.timestamp });
    targetTest.retry.steps = targetTest.retry.steps.slice(-maxStoredSteps);
    broadcast(run.id, { type: "test_update", timestamp: event.timestamp, testId: retry.testId, test: targetTest, runStatus: run.status, summary: run.summary });
    return;
  }

  if (event.type === "step_end" && targetTest.retry) {
    const step = targetTest.retry.steps.find((candidate) => candidate.stepId === event.stepId);
    if (step) {
      Object.assign(step, event, { status: event.error ? "failed" : "passed", endedAt: event.timestamp });
    }
    broadcast(run.id, { type: "test_update", timestamp: event.timestamp, testId: retry.testId, test: targetTest, runStatus: run.status, summary: run.summary });
    return;
  }

  if (event.type === "test_end" && testMatchesTarget(event, retry.target)) {
    targetTest.status = event.status;
    targetTest.duration = event.duration;
    targetTest.errors = event.errors || [];
    targetTest.attachments = await preserveAttachments(run, event);
    await uploadStoredAttachments(run, targetTest.attachments);
    targetTest.endedAt = event.timestamp;
    targetTest.retry = {
      ...(targetTest.retry || { id: retry.id, steps: [] }),
      status: event.status,
      endedAt: event.timestamp,
      duration: event.duration
    };
    run.currentTestId = null;
    recomputeRunSummary(run);
    broadcast(run.id, { type: "test_update", timestamp: event.timestamp, testId: retry.testId, test: targetTest, runStatus: run.status, summary: run.summary });
    return;
  }

  broadcast(run.id, event);
}

async function appendRunEvent(run, event) {
  const line = `${JSON.stringify(event)}\n`;
  await appendFile(path.join(getRunDir(run.id), "events.ndjson"), line);
  run.events.push(event);

  if (event.type === "run_begin") {
    run.expectedTotal = event.total || 0;
    run.expectedTests = Array.isArray(event.tests) ? event.tests : [];
  }

  if (event.type === "test_begin") {
    run.currentTestId = event.testId;
    run.tests[event.testId] = { ...event, status: "running", steps: [], startedAt: event.timestamp };
  }

  if (event.type === "step_begin" && run.tests[event.testId]) {
    run.tests[event.testId].steps.push({ ...event, status: "running", startedAt: event.timestamp });
    run.tests[event.testId].steps = run.tests[event.testId].steps.slice(-maxStoredSteps);
  }

  if (event.type === "step_end" && run.tests[event.testId]) {
    const step = run.tests[event.testId].steps.find((candidate) => candidate.stepId === event.stepId);
    if (step) {
      Object.assign(step, event, { status: event.error ? "failed" : "passed", endedAt: event.timestamp });
    }
  }

  if (event.type === "test_end") {
    event.attachments = await preserveAttachments(run, event);
    await uploadStoredAttachments(run, event.attachments);
    run.tests[event.testId] = {
      ...(run.tests[event.testId] || {}),
      ...event,
      endedAt: event.timestamp
    };
    if (run.currentTestId === event.testId) {
      run.currentTestId = null;
    }
    recomputeRunSummary(run);
  }

  broadcast(run.id, event);
}

function broadcast(runId, event) {
  const activeRun = activeRuns.get(runId);
  if (!activeRun) {
    return;
  }

  for (const subscriber of activeRun.subscribers) {
    subscriber.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`);
  }
}

async function startRun(body) {
  const config = getConfig();
  const id = createRunId();
  const runDir = getRunDir(id);
  const reportDir = path.join(runDir, "html-report");
  mkdirSync(runDir, { recursive: true });

  const options = {
    env: body.env || config.environments.default,
    mode: body.mode || config.profiles.defaultMode,
    flows: normalizeFlows(config, body),
    specFiles: Array.isArray(body.specFiles) ? body.specFiles : [],
    project: body.project || "chromium",
    grep: body.grep || "",
    workers: Number(body.workers || 1),
    retries: body.retries === "" || body.retries === undefined ? "" : Number(body.retries),
    headed: Boolean(body.headed),
    debug: Boolean(body.debug)
  };

  if (body.rerunTest) {
    const target = getRelativeTestTarget(body.rerunTest);
    if (!target) {
      throw new Error("Cannot rerun test without a file path.");
    }

    options.mode = "rerun-failed";
    options.flows = [];
    options.specFiles = [target];
    options.grep = "";
    options.rerunOf = {
      title: body.rerunTest.displayTitle || body.rerunTest.title || target,
      file: body.rerunTest.file || "",
      line: body.rerunTest.line || 0
    };
  }

  const run = {
    id,
    status: "running",
    startedAt: new Date().toISOString(),
    endedAt: null,
    exitCode: null,
    command: "",
    reportPath: path.relative(rootDir, reportDir),
    options,
    summary: {},
    expectedTotal: 0,
    expectedTests: [],
    currentTestId: null,
    tests: {},
    events: []
  };

  const args = buildPlaywrightArgs(run);
  run.command = `npx ${args.join(" ")}`;
  await saveRun(run);

  const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", args, {
    cwd: rootDir,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      TEST_ENV: options.env,
      PLAYWRIGHT_HTML_REPORT: reportDir,
      QA_DASHBOARD_RUN_ID: id
    }
  });

  activeRuns.set(id, { child, subscribers: new Set(), run });
  const outputBuffers = { stdout: "", stderr: "" };

  const handleOutput = async (source, chunk) => {
    const text = chunk.toString();
    await appendFile(path.join(runDir, "output.log"), text);
    outputBuffers[source] += text;
    const lines = outputBuffers[source].split(/\r?\n/);
    outputBuffers[source] = lines.pop() || "";

    for (const line of lines) {
      if (!line) {
        continue;
      }

      if (line.startsWith(eventPrefix)) {
        try {
          await appendRunEvent(run, JSON.parse(line.slice(eventPrefix.length)));
        } catch (error) {
          await appendRunEvent(run, { type: "log", source: "dashboard", timestamp: new Date().toISOString(), text: `Ignored malformed reporter event: ${error.message}` });
        }
      } else {
        await appendRunEvent(run, { type: "log", source, timestamp: new Date().toISOString(), text: line });
      }
    }

    await saveRun(run);
  };

  child.stdout.on("data", (chunk) => {
    handleOutput("stdout", chunk).catch(console.error);
  });
  child.stderr.on("data", (chunk) => {
    handleOutput("stderr", chunk).catch(console.error);
  });
  child.on("exit", async (code) => {
    for (const source of ["stdout", "stderr"]) {
      if (outputBuffers[source]) {
        await appendRunEvent(run, { type: "log", source, timestamp: new Date().toISOString(), text: outputBuffers[source] });
      }
    }

    run.status = run.status === "stopping" ? "interrupted" : code === 0 ? "passed" : "failed";
    run.exitCode = code;
    run.endedAt = new Date().toISOString();
    await appendRunEvent(run, { type: "run_end", timestamp: run.endedAt, status: run.status, exitCode: code });
    await saveRun(run);
    await archiveRun(run);
    activeRuns.delete(id);
  });

  return run;
}

async function retryTestInRun(runId, testId, body = {}) {
  const run = await readRun(runId);
  const targetTest = run.tests?.[testId];
  if (!targetTest) {
    throw new Error("Test was not found in this run.");
  }

  const target = getRelativeTestTarget(targetTest);
  if (!target) {
    throw new Error("Cannot rerun test without a file path.");
  }

  if (activeRuns.has(runId)) {
    throw new Error("A run or retry is already active for this report.");
  }

  const retryId = new Date().toISOString().replace(/[:.]/g, "-");
  const retryDir = path.join(getRunDir(run.id), "retries", retryId);
  const reportDir = path.join(retryDir, "html-report");
  mkdirSync(retryDir, { recursive: true });

  run.status = "retrying";
  run.currentTestId = testId;
  rememberPreviousAttempt(targetTest);
  targetTest.status = "retrying";
  targetTest.errors = [];
  targetTest.retry = {
    id: retryId,
    status: "queued",
    startedAt: new Date().toISOString(),
    steps: []
  };

  await saveRun(run);
  broadcast(run.id, { type: "test_update", timestamp: new Date().toISOString(), testId, test: targetTest, runStatus: run.status, summary: run.summary });

  const retryRun = {
    ...run,
    options: {
      env: run.options?.env || body.env || "uat",
      mode: "retry-failed",
      flows: [],
      specFiles: [target],
      project: targetTest.projectName || body.project || run.options?.project || "chromium",
      grep: "",
      workers: 1,
      retries: body.retries ?? 0,
      headed: Boolean(body.headed ?? run.options?.headed),
      debug: Boolean(body.debug ?? run.options?.debug),
      noDeps: true
    }
  };
  const args = buildPlaywrightArgs(retryRun);
  const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", args, {
    cwd: rootDir,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      TEST_ENV: retryRun.options.env,
      PLAYWRIGHT_HTML_REPORT: reportDir,
      QA_DASHBOARD_RUN_ID: run.id,
      QA_DASHBOARD_RETRY_ID: retryId
    }
  });

  activeRuns.set(run.id, { child, subscribers: new Set(), run });
  await appendRunEvent(run, {
    type: "log",
    source: "dashboard",
    timestamp: new Date().toISOString(),
    text: `Retry started for ${targetTest.displayTitle || targetTest.title || target}`
  });
  await saveRun(run);

  const retry = {
    id: retryId,
    testId,
    target: {
      file: targetTest.file,
      line: targetTest.line
    }
  };
  const outputBuffers = { stdout: "", stderr: "" };
  const handleOutput = async (source, chunk) => {
    const text = chunk.toString();
    await appendFile(path.join(retryDir, "output.log"), text);
    outputBuffers[source] += text;
    const lines = outputBuffers[source].split(/\r?\n/);
    outputBuffers[source] = lines.pop() || "";

    for (const line of lines) {
      if (!line) {
        continue;
      }

      if (line.startsWith(eventPrefix)) {
        try {
          await appendRetryEvent(run, retry, JSON.parse(line.slice(eventPrefix.length)));
        } catch (error) {
          await appendRunEvent(run, { type: "log", source: "dashboard", timestamp: new Date().toISOString(), text: `Ignored malformed reporter event: ${error.message}` });
        }
      } else {
        await appendRunEvent(run, { type: "log", source, timestamp: new Date().toISOString(), text: line });
      }
    }

    await saveRun(run);
  };

  child.stdout.on("data", (chunk) => handleOutput("stdout", chunk).catch(console.error));
  child.stderr.on("data", (chunk) => handleOutput("stderr", chunk).catch(console.error));
  child.on("exit", async (code) => {
    for (const source of ["stdout", "stderr"]) {
      if (outputBuffers[source]) {
        await appendRunEvent(run, { type: "log", source, timestamp: new Date().toISOString(), text: outputBuffers[source] });
      }
    }

    if (targetTest.status === "retrying") {
      targetTest.status = code === 0 ? "passed" : "failed";
      targetTest.retry = {
        ...(targetTest.retry || { id: retryId, steps: [] }),
        status: targetTest.status,
        endedAt: new Date().toISOString()
      };
    }

    run.currentTestId = null;
    recomputeRunSummary(run);
    run.endedAt = run.status === "passed" ? new Date().toISOString() : run.endedAt;
    await appendRunEvent(run, { type: "run_status", timestamp: new Date().toISOString(), status: run.status });
    await saveRun(run);
    await archiveRun(run);
    activeRuns.delete(run.id);
  });

  return run;
}

async function listRuns() {
  const remoteRuns = databaseEnabled ? await listPersistentRunSummaries() : await listPersistentRuns();
  if (remoteRuns !== null) return remoteRuns.map((run) => { recomputeRunSummary(run); return run; });
  if (!existsSync(runsRoot)) {
    return [];
  }

  const runs = [];
  for (const entry of readdirSync(runsRoot)) {
    const runPath = path.join(runsRoot, entry, "run.json");
    if (!existsSync(runPath)) continue;

    const run = await recoverRunFile(runPath, entry);
    if (!run) continue;

    if (await preserveRunAttachments(run)) {
      await saveRun(run);
    }
    if (applyUploadedArtifactUrls(run)) {
      await saveRun(run);
    }
    recomputeRunSummary(run);
    runs.push(run);
  }

  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 20);
}

async function reconcileStaleRuns() {
  const staleRuns = (await listRuns()).filter((run) => ["running", "stopping"].includes(run.status));
  for (const run of staleRuns) {
    run.status = "interrupted";
    run.endedAt = run.endedAt || new Date().toISOString();
    run.exitCode = run.exitCode ?? null;
    run.events = run.events || [];
    run.events.push({
      type: "run_end",
      timestamp: run.endedAt,
      status: "interrupted",
      exitCode: run.exitCode,
      reason: "Dashboard server restarted before the run completed."
    });
    await saveRun(run);
  }
}

async function streamEvents(req, res, runId) {
  const run = await readRun(runId);
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const liveOnly = requestUrl.searchParams.get("liveOnly") === "1";
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });

  if (!liveOnly) {
    for (const event of run.events || []) {
      res.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`);
    }
  }

  const activeRun = activeRuns.get(runId);
  if (!activeRun) {
    res.end();
    return;
  }

  activeRun.subscribers.add(res);
  req.on("close", () => activeRun.subscribers.delete(res));
}

function serveStatic(res, pathname) {
  const filePath = pathname === "/" ? path.join(dashboardDir, "index.html") : path.join(dashboardDir, pathname);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(dashboardDir) || !existsSync(resolved) || statSync(resolved).isDirectory()) {
    sendError(res, 404, "Not found");
    return;
  }

  const ext = path.extname(resolved);
  const contentType = contentTypeForPath(resolved);

  res.writeHead(200, { "content-type": contentType });
  createReadStream(resolved).pipe(res);
}

async function serveRunAttachment(res, runId, testId, attachmentIndex) {
  const run = await readRun(runId);
  const attachment = run.tests?.[testId]?.attachments?.[Number(attachmentIndex)];
  const sourcePath = resolveAttachmentSource(attachment?.path);

  if (!sourcePath) {
    sendError(res, 404, "Attachment not found");
    return;
  }

  res.writeHead(200, { "content-type": attachment.contentType || contentTypeForPath(sourcePath) });
  createReadStream(sourcePath).pipe(res);
}

async function serveRunAsset(res, pathname) {
  const relativePath = pathname.replace(/^\/data\/test-runs\//, "");
  const resolved = path.resolve(path.join(runsRoot, relativePath));
  if (!resolved.startsWith(runsRoot) || !existsSync(resolved) || statSync(resolved).isDirectory()) {
    const [runId, ...pathParts] = relativePath.split("/");
    const remote = await getRemoteArtifact(runId, pathParts.join("/"));
    if (!remote) { sendError(res, 404, "Not found"); return; }
    res.writeHead(200, { "content-type": remote.contentType });
    remote.body.pipe(res);
    return;
  }

  const contentType = contentTypeForPath(resolved);

  if (path.basename(resolved) === "run.json") {
    const runId = relativePath.split("/")[0];
    const run = await recoverRunFile(resolved, runId);
    if (!run) {
      sendError(res, 500, "Run file is corrupt and could not be recovered");
      return;
    }
  }

  res.writeHead(200, { "content-type": contentType });
  createReadStream(resolved).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    if (req.method === "GET" && pathname === "/api/config") {
      sendJson(res, 200, getConfig());
      return;
    }

    if (req.method === "GET" && pathname === "/api/runs") {
      sendJson(res, 200, await listRuns());
      return;
    }

    if (req.method === "POST" && pathname === "/api/runs") {
      sendJson(res, 201, await startRun(await readBody(req)));
      return;
    }

    const runMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);
    if (req.method === "GET" && runMatch) {
      sendJson(res, 200, await readRun(runMatch[1]));
      return;
    }

    const stopMatch = pathname.match(/^\/api\/runs\/([^/]+)\/stop$/);
    if (req.method === "POST" && stopMatch) {
      const activeRun = activeRuns.get(stopMatch[1]);
      if (!activeRun) {
        sendError(res, 404, "Run is not active");
        return;
      }

      activeRun.run.status = "stopping";
      await appendRunEvent(activeRun.run, {
        type: "run_status",
        timestamp: new Date().toISOString(),
        status: "stopping"
      });
      await appendRunEvent(activeRun.run, {
        type: "log",
        source: "dashboard",
        timestamp: new Date().toISOString(),
        text: "Stop requested. Terminating Playwright process tree..."
      });
      await saveRun(activeRun.run);

      sendJson(res, 200, { stopped: killRunProcess(activeRun.child) });
      return;
    }

    const retryMatch = pathname.match(/^\/api\/runs\/([^/]+)\/tests\/([^/]+)\/rerun$/);
    if (req.method === "POST" && retryMatch) {
      sendJson(res, 200, await retryTestInRun(retryMatch[1], retryMatch[2], await readBody(req)));
      return;
    }

    const attachmentMatch = pathname.match(/^\/api\/runs\/([^/]+)\/tests\/([^/]+)\/attachments\/(\d+)$/);
    if (req.method === "GET" && attachmentMatch) {
      await serveRunAttachment(res, attachmentMatch[1], attachmentMatch[2], attachmentMatch[3]);
      return;
    }

    const eventMatch = pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
    if (req.method === "GET" && eventMatch) {
      await streamEvents(req, res, eventMatch[1]);
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/data/test-runs/")) {
      await serveRunAsset(res, pathname);
      return;
    }

    serveStatic(res, pathname);
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

const port = Number(process.env.QA_DASHBOARD_PORT || process.env.PORT || 9324);
const host = process.env.QA_DASHBOARD_HOST || "127.0.0.1";
await initializePersistence();
await recoverCorruptedRunFiles();
await syncLocalRunsToDatabase();
await reconcileStaleRuns();
server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`QA dashboard running at http://${displayHost}:${port} (bind: ${host}, PostgreSQL: ${databaseEnabled ? "enabled" : "local only"}, object storage: ${objectStorageEnabled ? "enabled" : "local only"})`);
});
