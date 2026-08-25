import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const flowConfig = JSON.parse(readFileSync(path.resolve("config", "flows.json"), "utf8"));
const requestedFlows = process.argv.slice(2);
const flows = requestedFlows.length > 0 ? requestedFlows : flowConfig.defaultFlowOrder;

async function runFlow(flow) {
  const flowPath = path.resolve("tests", "flows", flow);
  if (!existsSync(flowPath)) {
    throw new Error(`Flow folder not found: ${flowPath}`);
  }

  await new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["playwright", "test", flowPath, "--workers=1"],
      { stdio: "inherit" }
    );

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Flow "${flow}" failed with exit code ${code ?? "unknown"}`));
    });
  });
}

for (const flow of flows) {
  console.log(`\n=== Running flow: ${flow} ===`);
  await runFlow(flow);
}

console.log("\nAll requested flows completed.");
