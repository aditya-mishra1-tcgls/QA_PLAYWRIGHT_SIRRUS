import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const flowConfig = JSON.parse(readFileSync(path.resolve("config", "flows.json"), "utf8"));
const profileConfigPath = path.resolve("config", "execution-profiles.json");
const profileConfig = existsSync(profileConfigPath)
  ? JSON.parse(readFileSync(profileConfigPath, "utf8"))
  : { defaultMode: "default", modes: { default: { flows: flowConfig.defaultFlowOrder } } };

function printHelp() {
  console.log(`
Usage:
  npm run test:flows -- [flow ...]
  npm run test:manual -- --mode=regression --env=uat

Options:
  --mode=<name>         Run a profile from config/execution-profiles.json
  --flows=a,b,c         Run exact flows in the provided order
  --env=<qa|uat>        Set TEST_ENV for this execution
  --headed              Run with a visible browser
  --ui                  Open Playwright UI mode
  --debug               Run Playwright in debug mode
  --grep=<pattern>      Run tests matching a title pattern
  --project=<name>      Select a Playwright project
  --report-name=<name>  Save HTML report under reports/<name>
  --list                Show available modes
`);
}

function parseArgs(argv) {
  const options = {
    positionalFlows: [],
    passthrough: []
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--list") {
      options.list = true;
    } else if (arg === "--headed") {
      options.headed = true;
    } else if (arg === "--ui") {
      options.ui = true;
    } else if (arg === "--debug") {
      options.debug = true;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.slice("--mode=".length);
    } else if (arg.startsWith("--flows=")) {
      options.flows = arg.slice("--flows=".length).split(",").map((flow) => flow.trim()).filter(Boolean);
    } else if (arg.startsWith("--env=")) {
      options.env = arg.slice("--env=".length);
    } else if (arg.startsWith("--grep=")) {
      options.grep = arg.slice("--grep=".length);
    } else if (arg.startsWith("--project=")) {
      options.project = arg.slice("--project=".length);
    } else if (arg.startsWith("--report-name=")) {
      options.reportName = arg.slice("--report-name=".length);
    } else if (arg.startsWith("--")) {
      options.passthrough.push(arg);
    } else {
      options.positionalFlows.push(arg);
    }
  }

  return options;
}

function getFlows(options) {
  if (options.flows?.length) {
    return options.flows;
  }

  if (options.positionalFlows.length) {
    return options.positionalFlows;
  }

  const modeName = options.mode || profileConfig.defaultMode;
  const mode = profileConfig.modes[modeName];
  if (!mode) {
    throw new Error(`Unknown mode "${modeName}". Use --list to see available modes.`);
  }

  return mode.flows;
}

function getFlowPath(flow) {
  if (flow.startsWith("tests/") || flow.startsWith("./tests/") || path.isAbsolute(flow)) {
    return path.resolve(flow);
  }

  return path.resolve("tests", "flows", flow);
}

function validateFlows(flows) {
  for (const flow of flows) {
    const flowPath = getFlowPath(flow);
    if (!existsSync(flowPath)) {
      throw new Error(`Flow folder not found: ${flowPath}`);
    }
  }
}

function buildReportName(options, flows) {
  if (options.reportName) {
    return options.reportName.replace(/[^a-zA-Z0-9._-]/g, "-");
  }

  const mode = options.mode || (options.flows?.length || options.positionalFlows.length ? "custom" : profileConfig.defaultMode);
  const env = options.env || process.env.TEST_ENV || "default-env";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${env}-${mode}-${flows.join("-")}`.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function listModes() {
  console.log("Available execution modes:");
  for (const [name, mode] of Object.entries(profileConfig.modes)) {
    console.log(`- ${name}: ${mode.flows.join(", ")} (${mode.description || "no description"})`);
  }
}

async function runFlows(flows, options) {
  validateFlows(flows);

  const flowPaths = flows.map(getFlowPath);
  const reportName = buildReportName(options, flows);
  const reportPath = path.resolve("reports", reportName);
  const args = ["playwright", options.ui ? "test" : "test", ...flowPaths, "--workers=1"];

  if (options.project) {
    args.push(`--project=${options.project}`);
  }

  if (options.grep) {
    args.push(`--grep=${options.grep}`);
  }

  if (options.headed) {
    args.push("--headed");
  }

  if (options.ui) {
    args.push("--ui");
  }

  if (options.debug) {
    args.push("--debug");
  }

  args.push(...options.passthrough);

  console.log(`\nMode: ${options.mode || "custom/default"}`);
  console.log(`Environment: ${options.env || process.env.TEST_ENV || "from .env/config default"}`);
  console.log(`Flows: ${flows.join(" -> ")}`);
  console.log(`HTML report: ${reportPath}`);
  console.log("");

  await new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      args,
      {
        stdio: "inherit",
        env: {
          ...process.env,
          ...(options.env ? { TEST_ENV: options.env } : {}),
          PLAYWRIGHT_HTML_REPORT: reportPath
        }
      }
    );

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Execution failed with exit code ${code ?? "unknown"}`));
    });
  });

  console.log(`\nExecution completed. Open report with: npx playwright show-report ${reportPath}`);
}

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

if (options.list) {
  listModes();
  process.exit(0);
}

const flows = getFlows(options);

await runFlows(flows, options);
