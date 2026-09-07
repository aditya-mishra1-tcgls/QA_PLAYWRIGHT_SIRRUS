const state = {
  config: null,
  session: null,
  runs: [],
  activeRun: null,
  eventSource: null,
  expandedTestIds: new Set(),
  expandedScreenshotTestIds: new Set(),
  logLines: [],
  logAutoScroll: true,
  renderScheduled: false
};

const maxVisibleSteps = 80;
const maxVisibleLogs = 300;
const dashboardBasePath = (() => {
  const scriptUrl = new URL(document.currentScript?.getAttribute("src") || "app.js", window.location.href);
  const basePath = scriptUrl.pathname.replace(/\/[^/]*$/, "");
  return basePath === "/" ? "" : basePath;
})();

const elements = {
  envSelect: document.querySelector("#envSelect"),
  modeSelect: document.querySelector("#modeSelect"),
  flowsList: document.querySelector("#flowsList"),
  moduleSelect: document.querySelector("#moduleSelect"),
  specSelect: document.querySelector("#specSelect"),
  projectSelect: document.querySelector("#projectSelect"),
  grepInput: document.querySelector("#grepInput"),
  workersInput: document.querySelector("#workersInput"),
  retriesInput: document.querySelector("#retriesInput"),
  testTimeoutInput: document.querySelector("#testTimeoutInput"),
  headedInput: document.querySelector("#headedInput"),
  debugInput: document.querySelector("#debugInput"),
  clearSpecSelectionButton: document.querySelector("#clearSpecSelectionButton"),
  runForm: document.querySelector("#runForm"),
  startRunButton: document.querySelector("#startRunButton"),
  stopRunButton: document.querySelector("#stopRunButton"),
  refreshRunsButton: document.querySelector("#refreshRunsButton"),
  clearLogsButton: document.querySelector("#clearLogsButton"),
  logoutButton: document.querySelector("#logoutButton"),
  configLink: document.querySelector("#configLink"),
  currentUserBadge: document.querySelector("#currentUserBadge"),
  statusValue: document.querySelector("#statusValue"),
  passedValue: document.querySelector("#passedValue"),
  failedValue: document.querySelector("#failedValue"),
  expectedValue: document.querySelector("#expectedValue"),
  durationValue: document.querySelector("#durationValue"),
  commandValue: document.querySelector("#commandValue"),
  runOwnerValue: document.querySelector("#runOwnerValue"),
  htmlReportLink: document.querySelector("#htmlReportLink"),
  currentTestCard: document.querySelector("#currentTestCard"),
  currentTestValue: document.querySelector("#currentTestValue"),
  skipCurrentTestButton: document.querySelector("#skipCurrentTestButton"),
  testList: document.querySelector("#testList"),
  logsOutput: document.querySelector("#logsOutput"),
  runsList: document.querySelector("#runsList")
};

function formatDuration(ms) {
  const value = Number(ms || 0);
  if (value < 1000) {
    return `${value}ms`;
  }

  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function formatElapsedSeconds(timestamp, startedAt) {
  const startTime = startedAt ? new Date(startedAt).getTime() : Date.now();
  const eventTime = timestamp ? new Date(timestamp).getTime() : Date.now();
  const elapsedMs = Math.max(0, eventTime - startTime);
  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

function formatLogLine(text, timestamp = new Date().toISOString(), startedAt = state.activeRun?.startedAt) {
  return `[${formatElapsedSeconds(timestamp, startedAt)}] ${text}`;
}

function setText(element, value) {
  const nextValue = String(value);
  if (element.textContent !== nextValue) {
    element.textContent = nextValue;
  }
}

function statusBadge(status) {
  const normalized = status || "pending";
  return `<span class="badge ${normalized}">${normalized}</span>`;
}

function testStatusIcon(status) {
  const normalized = status || "running";
  if (isRunningStatus(normalized)) {
    return '<span class="status-mark running" aria-hidden="true"></span>';
  }

  if (normalized === "passed") {
    return '<span class="status-mark passed" aria-hidden="true"><svg class="icon"><use href="#icon-check"></use></svg></span>';
  }

  if (isFailedStatus(normalized)) {
    return '<span class="status-mark failed" aria-hidden="true"><svg class="icon"><use href="#icon-alert"></use></svg></span>';
  }

  return '<span class="status-mark queued" aria-hidden="true"></span>';
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function runCountSummary(run) {
  const summary = run?.summary || {};
  const tests = Object.values(run?.tests || {});

  const fallbackCount = (statuses) => tests.filter((test) => statuses.includes(test.status)).length;
  const passed = numberOrZero(summary.passed ?? fallbackCount(["passed"]));
  const failed = numberOrZero(summary.failed ?? fallbackCount(["failed"]))
    + numberOrZero(summary.timedOut ?? fallbackCount(["timedOut"]))
    + numberOrZero(summary.interrupted ?? fallbackCount(["interrupted"]));
  const skipped = numberOrZero(summary.skipped ?? fallbackCount(["skipped"]))
    + numberOrZero(summary.queued ?? fallbackCount(["queued"]))
    + numberOrZero(summary.pending ?? fallbackCount(["pending"]))
    + numberOrZero(summary["not executed"] ?? 0)
    + numberOrZero(summary.notExecuted ?? fallbackCount(["notExecuted", "not-executed"]));

  return { passed, failed, skipped };
}

function runCountBadges(run) {
  const counts = runCountSummary(run);
  return `
    <span class="run-counts" aria-label="${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped">
      <span class="run-count passed" title="Passed">✓ ${counts.passed}</span>
      <span class="run-count failed" title="Failed">✕ ${counts.failed}</span>
      <span class="run-count skipped" title="Skipped">↷ ${counts.skipped}</span>
    </span>`;
}

function runOwnerLabel(run) {
  return run?.options?.runOwner || "Unknown user";
}

function attachmentUrl(run, test, attachment, index) {
  if (attachment?.url) {
    return attachment.url;
  }

  if (!attachment?.path && !attachment?.s3Key) {
    return "#";
  }

  return dashboardUrl(`/api/runs/${encodeURIComponent(run.id)}/tests/${encodeURIComponent(test.testId)}/attachments/${index}`);
}

function dashboardUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${dashboardBasePath}${normalizedPath}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function testDisplayTitle(test) {
  if (test?.displayTitle) {
    return test.displayTitle;
  }

  const parts = String(test?.title || "")
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.at(-1) || "Untitled test";
}

function testSubtitle(test) {
  const titlePath = Array.isArray(test?.titlePath) ? test.titlePath.filter(Boolean) : [];
  const suitePath = titlePath.length > 1 ? titlePath.slice(0, -1).join(" > ") : "";
  const filePath = test?.file ? `${test.file}${test.line ? `:${test.line}` : ""}` : "";
  return [suitePath, filePath].filter(Boolean).join(" | ");
}

function isFailedStatus(status) {
  return ["failed", "timedOut", "interrupted"].includes(status);
}

function isRunningStatus(status) {
  return ["running", "retrying"].includes(status);
}

function humanStepsFor(test) {
  return ((test.retry?.steps?.length ? test.retry.steps : test.steps) || [])
    .filter((step) => step.category === "test.step")
    .slice(-maxVisibleSteps);
}

function isLogScrolledToBottom(threshold = 12) {
  const remaining = elements.logsOutput.scrollHeight - elements.logsOutput.scrollTop - elements.logsOutput.clientHeight;
  return remaining <= threshold;
}

function renderLogLines() {
  elements.logsOutput.textContent = state.logLines.length ? `${state.logLines.join("\n")}\n` : "";
  if (state.logAutoScroll) {
    elements.logsOutput.scrollTop = elements.logsOutput.scrollHeight;
  }
}

function appendDashboardLog(text) {
  state.logLines.push(formatLogLine(text));
  state.logLines = state.logLines.slice(-maxVisibleLogs);
  renderLogLines();
}

function shouldShowLogEvent(event) {
  if (event.type !== "log") {
    return false;
  }

  if (!["stdout", "stderr"].includes(event.source)) {
    return true;
  }

  const text = String(event.text || "").trim();
  if (!text) {
    return false;
  }

  if (
    /^(\d+\)|\[\d+\/\d+\]|Running \d+ tests?|Retry #\d+)/i.test(text) ||
    /^[✓✘×-]\s/.test(text) ||
    /^(at |Error: expect|Call log:|waiting for|locator\.|page\.|browserContext\.|apiRequestContext\.)/i.test(text) ||
    /^(npx |TimeoutError:|Test timeout of|Slow test file:|To open last HTML report run:)/i.test(text)
  ) {
    return false;
  }

  return /failed|error|warning|warn|skipped|interrupted/i.test(text);
}

function resetLogs(lines = []) {
  state.logAutoScroll = true;
  state.logLines = lines.slice(-maxVisibleLogs);
  renderLogLines();
}

async function api(path, options) {
  const response = await fetch(dashboardUrl(path), {
    headers: { "content-type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

async function requireSession() {
  try {
    const session = await api("/api/session");
    if (!session.user) {
      window.location.assign(dashboardUrl("/login.html"));
      return null;
    }

    state.session = session;
    elements.currentUserBadge.textContent = `${session.user.username} (${session.user.role})`;
    elements.currentUserBadge.hidden = false;
    elements.configLink.href = dashboardUrl("/config.html");
    return session;
  } catch {
    window.location.assign(dashboardUrl("/login.html"));
    return null;
  }
}

async function logout() {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  window.location.assign(dashboardUrl("/login.html"));
}

function selectedFlows() {
  return [...elements.flowsList.querySelectorAll("input:checked")].map((input) => input.value);
}

function selectedSpecs() {
  return [...elements.specSelect.selectedOptions].map((option) => option.value);
}

function selectedModuleConfig() {
  const moduleName = elements.moduleSelect.value || state.config?.modules?.defaultModule || "engagement";
  return state.config?.modules?.modules?.[moduleName] || null;
}

function moduleScopedFlows() {
  const moduleConfig = selectedModuleConfig();
  if (!moduleConfig || !Array.isArray(moduleConfig.flows)) {
    return state.config?.flows || [];
  }

  return (state.config?.flows || []).filter((flow) => moduleConfig.flows.includes(flow));
}

function moduleScopedSpecFiles() {
  const moduleConfig = selectedModuleConfig();
  const prefixes = moduleConfig?.specFilePrefixes || [];
  if (!prefixes.length) {
    return state.config?.specFiles || [];
  }

  return (state.config?.specFiles || []).filter((file) => prefixes.some((prefix) => file.startsWith(prefix)));
}

function refreshModuleScopedOptions() {
  const previouslySelectedSpecs = new Set(selectedSpecs());
  const scopedFlows = moduleScopedFlows();
  const scopedSpecFiles = moduleScopedSpecFiles();

  elements.flowsList.innerHTML = scopedFlows
    .map((flow) => `<label><input type="checkbox" value="${escapeHtml(flow)}"> ${escapeHtml(flow)}</label>`)
    .join("") || '<span class="hint">No flows configured for this module yet.</span>';

  elements.specSelect.innerHTML = scopedSpecFiles
    .map((file) => `<option value="${escapeHtml(file)}" ${previouslySelectedSpecs.has(file) ? "selected" : ""}>${escapeHtml(file)}</option>`)
    .join("");

  applyModeFlows();
}

function populateConfig(config) {
  state.config = config;

  elements.envSelect.innerHTML = Object.keys(config.environments.environments || {})
    .map((env) => `<option value="${escapeHtml(env)}">${escapeHtml(env)}</option>`)
    .join("");
  elements.envSelect.value = config.environments.default || elements.envSelect.value;

  elements.modeSelect.innerHTML = Object.entries(config.profiles.modes || {})
    .map(([name, mode]) => `<option value="${escapeHtml(name)}">${escapeHtml(name)} - ${escapeHtml(mode.description || "")}</option>`)
    .join("");
  elements.modeSelect.value = config.profiles.defaultMode || elements.modeSelect.value;

  const modules = config.modules?.modules || { engagement: { label: "Engagement" } };
  elements.moduleSelect.innerHTML = Object.entries(modules)
    .map(([name, module]) => `<option value="${escapeHtml(name)}">${escapeHtml(module.label || name)}</option>`)
    .join("");
  elements.moduleSelect.value = config.modules?.defaultModule || "engagement";

  refreshModuleScopedOptions();

  elements.projectSelect.innerHTML = config.projects
    .map((project) => `<option value="${escapeHtml(project)}">${escapeHtml(project)}</option>`)
    .join("");
  elements.projectSelect.value = "chromium";

  applyModeFlows();
}

function applyModeFlows() {
  const mode = state.config?.profiles.modes?.[elements.modeSelect.value];
  const moduleConfig = selectedModuleConfig();
  const scopedFlows = new Set(moduleScopedFlows());
  const modeFlows = new Set(Array.isArray(moduleConfig?.flows)
    ? (mode?.flows || []).filter((flow) => scopedFlows.has(flow))
    : (mode?.flows || []));
  for (const checkbox of elements.flowsList.querySelectorAll("input")) {
    checkbox.checked = modeFlows.has(checkbox.value);
  }
}

function buildRunPayload() {
  return {
    env: elements.envSelect.value,
    module: elements.moduleSelect.value,
    mode: elements.modeSelect.value,
    flows: selectedFlows(),
    specFiles: selectedSpecs(),
    project: elements.projectSelect.value,
    grep: elements.grepInput.value.trim(),
    workers: Number(elements.workersInput.value || 1),
    retries: elements.retriesInput.value === "" ? "" : Number(elements.retriesInput.value),
    testTimeoutMs: Number(elements.testTimeoutInput.value || 2) * 60 * 1000,
    headed: elements.headedInput.checked,
    debug: elements.debugInput.checked
  };
}

function updateSummary(run) {
  const tests = Object.values(run?.tests || {});
  const passed = tests.filter((test) => test.status === "passed").length;
  const failed = tests.filter((test) => isFailedStatus(test.status)).length;
  const expected = run?.expectedTotal || run?.expectedTests?.length || tests.length;

  setText(elements.statusValue, run?.status || "Idle");
  setText(elements.passedValue, passed);
  setText(elements.failedValue, failed);
  setText(elements.expectedValue, expected);
  updateDuration(run);
}

function updateDuration(run) {
  if (run?.startedAt && !run.endedAt) {
    setText(elements.durationValue, formatDuration(Date.now() - new Date(run.startedAt).getTime()));
  } else if (run?.startedAt && run?.endedAt) {
    setText(elements.durationValue, formatDuration(new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime()));
  } else {
    setText(elements.durationValue, "0s");
  }
}

function getDisplayTests(run) {
  const actualTests = run?.tests || {};
  const expectedTests = run?.expectedTests || [];
  const expectedCards = expectedTests.map((test) => ({
    ...test,
    ...(actualTests[test.testId] || {}),
    status: actualTests[test.testId]?.status || "queued",
    steps: actualTests[test.testId]?.steps || []
  }));
  const expectedIds = new Set(expectedCards.map((test) => test.testId));
  const extraActualTests = Object.values(actualTests).filter((test) => !expectedIds.has(test.testId));

  return [...expectedCards, ...extraActualTests];
}

function updateCurrentTest(run) {
  const currentTest = Object.values(run?.tests || {}).find((test) => isRunningStatus(test.status));
  if (!currentTest) {
    elements.currentTestCard.hidden = true;
    elements.currentTestValue.textContent = "";
    elements.skipCurrentTestButton.dataset.skipCurrentTestId = "";
    return;
  }

  elements.currentTestCard.hidden = false;
  elements.currentTestValue.textContent = testDisplayTitle(currentTest);
  elements.skipCurrentTestButton.dataset.skipCurrentTestId = currentTest.testId || "";
}

function renderTests(run) {
  const tests = getDisplayTests(run);
  if (!tests.length) {
    elements.testList.className = "test-list empty";
    elements.testList.textContent = "Waiting for test events...";
    return;
  }

  elements.testList.className = "test-list";
  elements.testList.innerHTML = tests.map((test) => {
    const imageAttachments = (test.attachments || [])
      .map((attachment, index) => ({ attachment, index }))
      .filter(({ attachment }) => attachment.contentType === "image/png" || attachment.contentType === "image/jpeg");
    const humanSteps = humanStepsFor(test);

    return `
    <article class="test-card ${test.status || "running"} ${test.status === "passed" && !state.expandedTestIds.has(test.testId) ? "collapsed" : ""}" data-test-id="${escapeHtml(test.testId || "")}">
      <div class="test-title">
        <div class="test-title-main">
          ${testStatusIcon(test.status)}
          <strong>${escapeHtml(testDisplayTitle(test))}</strong>
        </div>
        <div class="test-actions">
          ${isRunningStatus(test.status) ? `<button class="skip-button" type="button" data-skip-current-test-id="${escapeHtml(test.testId || "")}">Skip</button>` : ""}
          ${isFailedStatus(test.status) ? `<button class="rerun-button" type="button" data-rerun-test-id="${escapeHtml(test.testId || "")}">Retry</button>` : ""}
          ${statusBadge(test.status || "running")}
        </div>
      </div>
      <div class="meta">${escapeHtml(testSubtitle(test))} ${test.duration ? `- ${formatDuration(test.duration)}` : ""}</div>
      ${test.retry ? `<div class="retry-meta">Retry ${escapeHtml(test.retry.status)}${test.retry.duration ? ` - ${formatDuration(test.retry.duration)}` : ""}</div>` : ""}
      ${humanSteps.length ? `<div class="steps">
        ${humanSteps.map((step) => `
          <div class="step">
            <div class="step-row">
              <span>${escapeHtml(step.title)}</span>
              <strong>${step.duration === undefined ? "..." : formatDuration(step.duration)}</strong>
            </div>
          </div>
        `).join("")}
      </div>` : ""}
      ${(test.attempts || []).slice(-1).map((attempt) => `
        <details class="previous-attempt">
          <summary>Previous failure</summary>
          ${(attempt.errors || []).map((error) => `<pre class="error">${escapeHtml(error.message || error.stack || "Unknown error")}</pre>`).join("")}
        </details>
      `).join("")}
      ${(test.errors || []).map((error) => `<pre class="error">${escapeHtml(error.message || error.stack || "Unknown error")}</pre>`).join("")}
      ${imageAttachments.length ? `
        <details class="failure-screenshots" data-screenshot-test-id="${escapeHtml(test.testId || "")}" ${state.expandedScreenshotTestIds.has(test.testId) ? "open" : ""}>
          <summary>Failure screenshots (${imageAttachments.length})</summary>
          <div class="screenshot-grid">
            ${imageAttachments.map(({ attachment, index }) => `
              <a href="${attachmentUrl(run, test, attachment, index)}" target="_blank" rel="noreferrer">
                <img src="${attachmentUrl(run, test, attachment, index)}" alt="${escapeHtml(attachment.name || "Failure screenshot")}">
                <span>${escapeHtml(attachment.name || "Screenshot")}</span>
                ${attachment.uploadError ? `<small>${escapeHtml(attachment.uploadError)}</small>` : ""}
              </a>
            `).join("")}
          </div>
        </details>` : ""}
    </article>
  `;
  }).join("");

  const runningSteps = elements.testList.querySelector(".test-card.running .steps, .test-card.retrying .steps");
  if (runningSteps) {
    runningSteps.scrollTop = runningSteps.scrollHeight;
  }
}

function renderRun(run) {
  state.activeRun = run;
  elements.commandValue.textContent = run?.command || "No run selected";
  elements.runOwnerValue.hidden = !run;
  elements.runOwnerValue.innerHTML = run
    ? `<svg class="icon"><use href="#icon-user"></use></svg> Ran by ${escapeHtml(runOwnerLabel(run))}`
    : "";
  elements.htmlReportLink.hidden = !run?.reportPath;
  if (run?.reportPath) {
    elements.htmlReportLink.href = run.reportUrl || dashboardUrl(`/api/runs/${encodeURIComponent(run.id)}/report`);
    elements.htmlReportLink.title = run.reportUrl ? "Open presigned S3 HTML report" : "Open HTML report";
  }

  elements.stopRunButton.disabled = !isRunningStatus(run?.status);
  updateSummary(run);
  updateCurrentTest(run);
  renderTests(run);
}

function scheduleRender(run) {
  state.activeRun = run;
  if (state.renderScheduled) {
    return;
  }

  state.renderScheduled = true;
  requestAnimationFrame(() => {
    state.renderScheduled = false;
    renderRun(state.activeRun);
  });
}

function appendLog(event) {
  if (!shouldShowLogEvent(event)) {
    return;
  }

  const line = formatLogLine(event.text, event.timestamp, state.activeRun?.startedAt);
  state.logLines.push(line);
  state.logLines = state.logLines.slice(-maxVisibleLogs);
  renderLogLines();
}

function applyEvent(event) {
  const run = state.activeRun;
  if (!run) {
    return;
  }

  run.events = run.events || [];
  run.tests = run.tests || {};
  run.events.push(event);
  run.events = run.events.slice(-500);
  let shouldRender = false;

  if (event.type === "test_begin") {
    run.tests[event.testId] = { ...event, status: "running", steps: [] };
    run.currentTestId = event.testId;
    shouldRender = true;
  }

  if (event.type === "run_begin") {
    const isSingleTestRetry = run.status === "retrying" && Array.isArray(event.tests) && event.tests.length <= 1 && (run.expectedTests || []).length > 1;
    if (!isSingleTestRetry) {
      run.expectedTotal = event.total || 0;
      run.expectedTests = Array.isArray(event.tests) ? event.tests : [];
    }
    shouldRender = true;
  }

  if (event.type === "step_begin" && event.category === "test.step" && run.tests[event.testId]) {
    run.tests[event.testId].steps.push({ ...event, status: "running" });
    run.tests[event.testId].steps = run.tests[event.testId].steps.slice(-maxVisibleSteps);
    shouldRender = true;
  }

  if (event.type === "step_end" && run.tests[event.testId]) {
    const step = run.tests[event.testId].steps.find((candidate) => candidate.stepId === event.stepId);
    if (step) {
      Object.assign(step, event, { status: event.error ? "failed" : "passed" });
      shouldRender = true;
    }
  }

  if (event.type === "test_end") {
    run.tests[event.testId] = { ...(run.tests[event.testId] || {}), ...event };
    if (run.currentTestId === event.testId) {
      run.currentTestId = null;
    }
    shouldRender = true;
  }

  if (event.type === "run_end") {
    run.status = event.status;
    run.exitCode = event.exitCode;
    run.endedAt = event.timestamp;
    elements.stopRunButton.disabled = true;
    loadRuns();
    shouldRender = true;
  }

  if (event.type === "run_status") {
    run.status = event.status;
    if (!isRunningStatus(run.status)) {
      elements.stopRunButton.disabled = true;
      loadRuns();
    }
    shouldRender = true;
  }

  if (event.type === "report_ready") {
    run.reportUrl = event.reportUrl || run.reportUrl;
    shouldRender = true;
  }

  if (event.type === "test_update") {
    run.tests[event.testId] = event.test;
    if (run.currentTestId === event.testId && !isRunningStatus(event.test?.status)) {
      run.currentTestId = null;
    }
    run.status = event.runStatus || run.status;
    run.summary = event.summary || run.summary;
    shouldRender = true;
  }

  appendLog(event);
  if (shouldRender) {
    scheduleRender(run);
  }
}

function connectEvents(runId, options = {}) {
  if (state.eventSource) {
    state.eventSource.close();
  }

  state.eventSource = new EventSource(dashboardUrl(`/api/runs/${runId}/events${options.liveOnly ? "?liveOnly=1" : ""}`));
  state.eventSource.onmessage = (message) => applyEvent(JSON.parse(message.data));
}

async function startRun(event) {
  event.preventDefault();
  elements.startRunButton.disabled = true;
  resetLogs();

  try {
    const run = await api("/api/runs", {
      method: "POST",
      body: JSON.stringify(buildRunPayload())
    });
    renderRun(run);
    connectEvents(run.id);
    loadRuns();
  } catch (error) {
    appendDashboardLog(error.message);
  } finally {
    elements.startRunButton.disabled = false;
  }
}

async function startRerun(testId) {
  if (!state.activeRun?.id) {
    appendDashboardLog("Rerun failed: No report is open.");
    return;
  }

  let activeRun = state.activeRun;
  if (!activeRun.tests?.[testId]) {
    activeRun = await api(`/api/runs/${activeRun.id}`);
    renderRun(activeRun);
  }

  const failedTest = activeRun.tests?.[testId];
  if (!failedTest) {
    appendDashboardLog("Rerun failed: Test was not found in this report.");
    return;
  }

  appendDashboardLog(`Starting retry for ${testDisplayTitle(failedTest)}...`);

  const run = await api(`/api/runs/${activeRun.id}/tests/rerun?testId=${encodeURIComponent(testId)}`, {
    method: "POST",
    body: JSON.stringify({
      env: activeRun.options?.env || elements.envSelect.value,
      module: activeRun.options?.module || elements.moduleSelect.value,
      project: failedTest.projectName || activeRun.options?.project || elements.projectSelect.value,
      retries: activeRun.options?.retries ?? 0,
      headed: Boolean(activeRun.options?.headed),
      debug: Boolean(activeRun.options?.debug)
    })
  });
  renderRun(run);
  connectEvents(run.id, { liveOnly: true });
  loadRuns();
}

async function skipCurrentTest(testId) {
  if (!testId && state.activeRun?.tests) {
    testId = Object.values(state.activeRun.tests).find((test) => isRunningStatus(test.status))?.testId || "";
  }

  if (!state.activeRun?.id || !testId) {
    appendDashboardLog("Skip failed: No running test is selected.");
    return;
  }

  appendDashboardLog("Skipping current test...");

  const run = await api(`/api/runs/${state.activeRun.id}/tests/skip-current?testId=${encodeURIComponent(testId)}`, { method: "POST" });
  renderRun(run);
  connectEvents(run.id, { liveOnly: true });
  loadRuns();
}

async function loadRuns() {
  state.runs = await api("/api/runs");
  if (!state.runs.length) {
    elements.runsList.className = "runs-list empty";
    elements.runsList.textContent = "No saved reports yet.";
    return;
  }

  elements.runsList.className = "runs-list";
  elements.runsList.innerHTML = state.runs.map((run) => `
    <article class="run-card" data-run-id="${run.id}">
      <div class="run-title">
        <strong>${escapeHtml(run.options?.module || "engagement")} / ${escapeHtml(run.options?.mode || "custom")} / ${escapeHtml(run.options?.env || "")}</strong>
        ${runCountBadges(run)}
      </div>
      <div class="meta run-card-meta">
        <span><svg class="icon"><use href="#icon-user"></use></svg> Ran by ${escapeHtml(runOwnerLabel(run))}</span>
        <span>${new Date(run.startedAt).toLocaleString()}</span>
        <span>${escapeHtml((run.options?.flows || []).join(", ") || "custom selection")}</span>
      </div>
    </article>
  `).join("");
}

async function openRun(runId) {
  const run = await api(`/api/runs/${runId}`);
  state.logLines = (run.events || [])
    .filter(shouldShowLogEvent)
    .map((event) => formatLogLine(event.text, event.timestamp, run.startedAt))
    .slice(-maxVisibleLogs);
  resetLogs(state.logLines);
  renderRun(run);

  if (isRunningStatus(run.status)) {
    connectEvents(run.id);
  }
}

async function stopRun() {
  if (!state.activeRun) {
    return;
  }

  elements.stopRunButton.disabled = true;
  try {
    await api(`/api/runs/${state.activeRun.id}/stop`, { method: "POST" });
  } catch (error) {
    elements.stopRunButton.disabled = false;
    appendDashboardLog(`Stop failed: ${error.message}`);
  }
}

elements.modeSelect.addEventListener("change", applyModeFlows);
elements.moduleSelect.addEventListener("change", refreshModuleScopedOptions);
elements.runForm.addEventListener("submit", startRun);
elements.stopRunButton.addEventListener("click", stopRun);
elements.logoutButton.addEventListener("click", logout);
elements.skipCurrentTestButton.addEventListener("click", () => {
  elements.skipCurrentTestButton.disabled = true;
  skipCurrentTest(elements.skipCurrentTestButton.dataset.skipCurrentTestId).catch((error) => {
    appendDashboardLog(`Skip failed: ${error.message}`);
  }).finally(() => {
    elements.skipCurrentTestButton.disabled = false;
  });
});
elements.refreshRunsButton.addEventListener("click", loadRuns);
elements.clearLogsButton.addEventListener("click", () => {
  resetLogs();
});
elements.logsOutput.addEventListener("scroll", () => {
  state.logAutoScroll = isLogScrolledToBottom();
});
elements.clearSpecSelectionButton.addEventListener("click", () => {
  for (const option of elements.specSelect.options) {
    option.selected = false;
  }
});
elements.runsList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-run-id]");
  if (card) {
    openRun(card.dataset.runId);
  }
});
elements.testList.addEventListener("click", (event) => {
  const interactiveTarget = event.target.closest("a, button, summary, input, select, textarea, label");
  if (interactiveTarget && !interactiveTarget.matches("[data-rerun-test-id], [data-skip-current-test-id]")) {
    return;
  }

  const rerunButton = event.target.closest("[data-rerun-test-id]");
  if (rerunButton) {
    event.stopPropagation();
    rerunButton.disabled = true;
    startRerun(rerunButton.dataset.rerunTestId).catch((error) => {
      appendDashboardLog(`Rerun failed: ${error.message}`);
    }).finally(() => {
      rerunButton.disabled = false;
    });
    return;
  }

  const skipButton = event.target.closest("[data-skip-current-test-id]");
  if (skipButton) {
    event.stopPropagation();
    skipButton.disabled = true;
    skipCurrentTest(skipButton.dataset.skipCurrentTestId).catch((error) => {
      appendDashboardLog(`Skip failed: ${error.message}`);
    }).finally(() => {
      skipButton.disabled = false;
    });
    return;
  }

  const card = event.target.closest("[data-test-id]");
  if (!card?.dataset.testId || !state.activeRun) {
    return;
  }

  if (state.expandedTestIds.has(card.dataset.testId)) {
    state.expandedTestIds.delete(card.dataset.testId);
  } else {
    state.expandedTestIds.add(card.dataset.testId);
  }

  renderRun(state.activeRun);
});
elements.testList.addEventListener("toggle", (event) => {
  const details = event.target.closest?.("[data-screenshot-test-id]");
  if (!details?.dataset.screenshotTestId) {
    return;
  }

  if (details.open) {
    state.expandedScreenshotTestIds.add(details.dataset.screenshotTestId);
  } else {
    state.expandedScreenshotTestIds.delete(details.dataset.screenshotTestId);
  }
}, true);

setInterval(() => {
  if (isRunningStatus(state.activeRun?.status)) {
    updateDuration(state.activeRun);
  }
}, 1000);

requireSession()
  .then((session) => {
    if (!session) {
      return null;
    }

    return Promise.all([
      api("/api/config").then(populateConfig),
      loadRuns(),
    ]);
  })
  .catch((error) => {
    appendDashboardLog(error.message);
  });
