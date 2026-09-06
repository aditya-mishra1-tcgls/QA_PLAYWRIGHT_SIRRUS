const state = {
  config: null,
  runs: [],
  activeRun: null,
  eventSource: null,
  expandedTestIds: new Set(),
  logLines: [],
  renderScheduled: false
};

const maxVisibleSteps = 80;
const maxVisibleLogs = 300;

const elements = {
  envSelect: document.querySelector("#envSelect"),
  modeSelect: document.querySelector("#modeSelect"),
  flowsList: document.querySelector("#flowsList"),
  specSelect: document.querySelector("#specSelect"),
  projectSelect: document.querySelector("#projectSelect"),
  grepInput: document.querySelector("#grepInput"),
  workersInput: document.querySelector("#workersInput"),
  retriesInput: document.querySelector("#retriesInput"),
  headedInput: document.querySelector("#headedInput"),
  debugInput: document.querySelector("#debugInput"),
  clearSpecSelectionButton: document.querySelector("#clearSpecSelectionButton"),
  runForm: document.querySelector("#runForm"),
  startRunButton: document.querySelector("#startRunButton"),
  stopRunButton: document.querySelector("#stopRunButton"),
  refreshRunsButton: document.querySelector("#refreshRunsButton"),
  clearLogsButton: document.querySelector("#clearLogsButton"),
  statusValue: document.querySelector("#statusValue"),
  passedValue: document.querySelector("#passedValue"),
  failedValue: document.querySelector("#failedValue"),
  expectedValue: document.querySelector("#expectedValue"),
  durationValue: document.querySelector("#durationValue"),
  commandValue: document.querySelector("#commandValue"),
  htmlReportLink: document.querySelector("#htmlReportLink"),
  currentTestCard: document.querySelector("#currentTestCard"),
  currentTestValue: document.querySelector("#currentTestValue"),
  testList: document.querySelector("#testList"),
  logsOutput: document.querySelector("#logsOutput"),
  runsList: document.querySelector("#runsList")
};

function formatDuration(ms) {
  const value = Number(ms || 0);
  if (value < 1000) {
    return `${value}ms`;
  }

  return `${(value / 1000).toFixed(1)}s`;
}

function statusBadge(status) {
  const normalized = status || "pending";
  return `<span class="badge ${normalized}">${normalized}</span>`;
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

async function api(path, options) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

function selectedFlows() {
  return [...elements.flowsList.querySelectorAll("input:checked")].map((input) => input.value);
}

function selectedSpecs() {
  return [...elements.specSelect.selectedOptions].map((option) => option.value);
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

  elements.flowsList.innerHTML = config.flows
    .map((flow) => `<label><input type="checkbox" value="${escapeHtml(flow)}"> ${escapeHtml(flow)}</label>`)
    .join("");

  elements.specSelect.innerHTML = config.specFiles
    .map((file) => `<option value="${escapeHtml(file)}">${escapeHtml(file)}</option>`)
    .join("");

  elements.projectSelect.innerHTML = config.projects
    .map((project) => `<option value="${escapeHtml(project)}">${escapeHtml(project)}</option>`)
    .join("");
  elements.projectSelect.value = "chromium";

  applyModeFlows();
}

function applyModeFlows() {
  const mode = state.config?.profiles.modes?.[elements.modeSelect.value];
  const modeFlows = new Set(mode?.flows || []);
  for (const checkbox of elements.flowsList.querySelectorAll("input")) {
    checkbox.checked = modeFlows.has(checkbox.value);
  }
}

function buildRunPayload() {
  return {
    env: elements.envSelect.value,
    mode: elements.modeSelect.value,
    flows: selectedFlows(),
    specFiles: selectedSpecs(),
    project: elements.projectSelect.value,
    grep: elements.grepInput.value.trim(),
    workers: Number(elements.workersInput.value || 1),
    retries: elements.retriesInput.value === "" ? "" : Number(elements.retriesInput.value),
    headed: elements.headedInput.checked,
    debug: elements.debugInput.checked
  };
}

function updateSummary(run) {
  const tests = Object.values(run?.tests || {});
  const passed = tests.filter((test) => test.status === "passed").length;
  const failed = tests.filter((test) => isFailedStatus(test.status)).length;
  const expected = run?.expectedTotal || run?.expectedTests?.length || tests.length;

  elements.statusValue.textContent = run?.status || "Idle";
  elements.passedValue.textContent = String(passed);
  elements.failedValue.textContent = String(failed);
  elements.expectedValue.textContent = String(expected);

  if (run?.startedAt && !run.endedAt) {
    elements.durationValue.textContent = formatDuration(Date.now() - new Date(run.startedAt).getTime());
  } else if (run?.startedAt && run?.endedAt) {
    elements.durationValue.textContent = formatDuration(new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime());
  } else {
    elements.durationValue.textContent = "0s";
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
    return;
  }

  elements.currentTestCard.hidden = false;
  elements.currentTestValue.textContent = testDisplayTitle(currentTest);
}

function renderTests(run) {
  const tests = getDisplayTests(run);
  if (!tests.length) {
    elements.testList.className = "test-list empty";
    elements.testList.textContent = "Waiting for test events...";
    return;
  }

  elements.testList.className = "test-list";
  elements.testList.innerHTML = tests.map((test) => `
    <article class="test-card ${test.status || "running"} ${test.status === "passed" && !state.expandedTestIds.has(test.testId) ? "collapsed" : ""}" data-test-id="${escapeHtml(test.testId || "")}">
      <div class="test-title">
        <strong>${escapeHtml(testDisplayTitle(test))}</strong>
        <div class="test-actions">
          ${isFailedStatus(test.status) ? `<button class="rerun-button" type="button" data-rerun-test-id="${escapeHtml(test.testId || "")}">Retry</button>` : ""}
          ${statusBadge(test.status || "running")}
        </div>
      </div>
      <div class="meta">${escapeHtml(testSubtitle(test))} ${test.duration ? `- ${formatDuration(test.duration)}` : ""}</div>
      ${test.retry ? `<div class="retry-meta">Retry ${escapeHtml(test.retry.status)}${test.retry.duration ? ` - ${formatDuration(test.retry.duration)}` : ""}</div>` : ""}
      <div class="steps">
        ${((test.retry?.steps?.length ? test.retry.steps : test.steps) || []).slice(-maxVisibleSteps).map((step) => `
          <div class="step">
            <div class="step-row">
              <span>${escapeHtml(step.title)}</span>
              <strong>${step.duration === undefined ? "..." : formatDuration(step.duration)}</strong>
            </div>
            <small>${escapeHtml(step.category || "step")}</small>
          </div>
        `).join("")}
      </div>
      ${(test.attempts || []).slice(-1).map((attempt) => `
        <details class="previous-attempt">
          <summary>Previous failure</summary>
          ${(attempt.errors || []).map((error) => `<pre class="error">${escapeHtml(error.message || error.stack || "Unknown error")}</pre>`).join("")}
        </details>
      `).join("")}
      ${(test.errors || []).map((error) => `<pre class="error">${escapeHtml(error.message || error.stack || "Unknown error")}</pre>`).join("")}
      ${((test.attachments || []).filter((attachment) => attachment.contentType === "image/png" || attachment.contentType === "image/jpeg")).length ? `
        <details class="failure-screenshots">
          <summary>Failure screenshots (${(test.attachments || []).filter((attachment) => attachment.contentType === "image/png" || attachment.contentType === "image/jpeg").length})</summary>
          <div class="screenshot-grid">
            ${(test.attachments || []).filter((attachment) => attachment.contentType === "image/png" || attachment.contentType === "image/jpeg").map((attachment) => `
              <a href="/${encodeURI(attachment.path)}" target="_blank" rel="noreferrer">
                <img src="/${encodeURI(attachment.path)}" alt="${escapeHtml(attachment.name || "Failure screenshot")}">
                <span>${escapeHtml(attachment.name || "Screenshot")}</span>
              </a>
            `).join("")}
          </div>
        </details>` : ""}
    </article>
  `).join("");

  const runningSteps = elements.testList.querySelector(".test-card.running .steps, .test-card.retrying .steps");
  if (runningSteps) {
    runningSteps.scrollTop = runningSteps.scrollHeight;
  }
}

function renderRun(run) {
  state.activeRun = run;
  elements.commandValue.textContent = run?.command || "No run selected";
  elements.htmlReportLink.hidden = !run?.reportPath;
  if (run?.reportPath) {
    elements.htmlReportLink.href = `/${run.reportPath}/index.html`;
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
  if (event.type !== "log") {
    return;
  }

  const line = `[${new Date(event.timestamp).toLocaleTimeString()}] ${event.text}`;
  state.logLines.push(line);
  state.logLines = state.logLines.slice(-maxVisibleLogs);
  elements.logsOutput.textContent = `${state.logLines.join("\n")}\n`;
  elements.logsOutput.scrollTop = elements.logsOutput.scrollHeight;
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

  if (event.type === "test_begin") {
    run.tests[event.testId] = { ...event, status: "running", steps: [] };
  }

  if (event.type === "run_begin") {
    const isSingleTestRetry = run.status === "retrying" && Array.isArray(event.tests) && event.tests.length <= 1 && (run.expectedTests || []).length > 1;
    if (!isSingleTestRetry) {
      run.expectedTotal = event.total || 0;
      run.expectedTests = Array.isArray(event.tests) ? event.tests : [];
    }
  }

  if (event.type === "step_begin" && run.tests[event.testId]) {
    run.tests[event.testId].steps.push({ ...event, status: "running" });
    run.tests[event.testId].steps = run.tests[event.testId].steps.slice(-maxVisibleSteps);
  }

  if (event.type === "step_end" && run.tests[event.testId]) {
    const step = run.tests[event.testId].steps.find((candidate) => candidate.stepId === event.stepId);
    if (step) {
      Object.assign(step, event, { status: event.error ? "failed" : "passed" });
    }
  }

  if (event.type === "test_end") {
    run.tests[event.testId] = { ...(run.tests[event.testId] || {}), ...event };
  }

  if (event.type === "run_end") {
    run.status = event.status;
    run.exitCode = event.exitCode;
    run.endedAt = event.timestamp;
    elements.stopRunButton.disabled = true;
    loadRuns();
  }

  if (event.type === "run_status") {
    run.status = event.status;
    if (!isRunningStatus(run.status)) {
      elements.stopRunButton.disabled = true;
      loadRuns();
    }
  }

  if (event.type === "test_update") {
    run.tests[event.testId] = event.test;
    run.status = event.runStatus || run.status;
    run.summary = event.summary || run.summary;
  }

  appendLog(event);
  scheduleRender(run);
}

function connectEvents(runId, options = {}) {
  if (state.eventSource) {
    state.eventSource.close();
  }

  state.eventSource = new EventSource(`/api/runs/${runId}/events${options.liveOnly ? "?liveOnly=1" : ""}`);
  state.eventSource.onmessage = (message) => applyEvent(JSON.parse(message.data));
}

async function startRun(event) {
  event.preventDefault();
  elements.startRunButton.disabled = true;
  elements.logsOutput.textContent = "";

  try {
    const run = await api("/api/runs", {
      method: "POST",
      body: JSON.stringify(buildRunPayload())
    });
    renderRun(run);
    connectEvents(run.id);
    loadRuns();
  } catch (error) {
    elements.logsOutput.textContent += `${error.message}\n`;
  } finally {
    elements.startRunButton.disabled = false;
  }
}

async function startRerun(testId) {
  const failedTest = state.activeRun?.tests?.[testId];
  if (!failedTest) {
    return;
  }

  const run = await api(`/api/runs/${state.activeRun.id}/tests/${testId}/rerun`, {
    method: "POST",
    body: JSON.stringify({
      env: state.activeRun.options?.env || elements.envSelect.value,
      project: failedTest.projectName || state.activeRun.options?.project || elements.projectSelect.value,
      retries: state.activeRun.options?.retries ?? 0,
      headed: Boolean(state.activeRun.options?.headed),
      debug: Boolean(state.activeRun.options?.debug)
    })
  });
  renderRun(run);
  connectEvents(state.activeRun.id, { liveOnly: true });
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
        <strong>${escapeHtml(run.options?.mode || "custom")} / ${escapeHtml(run.options?.env || "")}</strong>
        ${statusBadge(run.status)}
      </div>
      <div class="meta">${new Date(run.startedAt).toLocaleString()} - ${escapeHtml((run.options?.flows || []).join(", "))}</div>
    </article>
  `).join("");
}

async function openRun(runId) {
  const run = await api(`/api/runs/${runId}`);
  state.logLines = (run.events || [])
    .filter((event) => event.type === "log")
    .map((event) => `[${new Date(event.timestamp).toLocaleTimeString()}] ${event.text}`)
    .slice(-maxVisibleLogs);
  elements.logsOutput.textContent = state.logLines.join("\n");
  if (elements.logsOutput.textContent) {
    elements.logsOutput.textContent += "\n";
  }
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
    elements.logsOutput.textContent += `[${new Date().toLocaleTimeString()}] Stop failed: ${error.message}\n`;
    elements.logsOutput.scrollTop = elements.logsOutput.scrollHeight;
  }
}

elements.modeSelect.addEventListener("change", applyModeFlows);
elements.runForm.addEventListener("submit", startRun);
elements.stopRunButton.addEventListener("click", stopRun);
elements.refreshRunsButton.addEventListener("click", loadRuns);
elements.clearLogsButton.addEventListener("click", () => {
  elements.logsOutput.textContent = "";
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
  const rerunButton = event.target.closest("[data-rerun-test-id]");
  if (rerunButton) {
    event.stopPropagation();
    startRerun(rerunButton.dataset.rerunTestId).catch((error) => {
      elements.logsOutput.textContent += `[${new Date().toLocaleTimeString()}] Rerun failed: ${error.message}\n`;
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

setInterval(() => {
  if (isRunningStatus(state.activeRun?.status)) {
    updateSummary(state.activeRun);
  }
}, 1000);

Promise.all([
  api("/api/config").then(populateConfig),
  loadRuns()
]).catch((error) => {
  elements.logsOutput.textContent = error.message;
});
