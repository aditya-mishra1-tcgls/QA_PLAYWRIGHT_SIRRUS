import fs from "node:fs";
import path from "node:path";
import environments from "../../config/environments.json";
import users from "../data/users.json";
import leads from "../data/leads.json";

type EnvConfig = {
  envName: string;
  baseUrl: string;
  activeProjectName: string;
  mobileNumber: string;
  otp: string;
  users: typeof users;
  leads: typeof leads;
};

function hydrateDotEnv() {
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function loadEnv(): EnvConfig {
  hydrateDotEnv();

  const selectedEnv = process.env.TEST_ENV || environments.default;
  const availableEnv = environments.environments[selectedEnv as keyof typeof environments.environments];
  if (!availableEnv) {
    throw new Error(`Unknown TEST_ENV "${selectedEnv}". Check config/environments.json.`);
  }

  const accountsPath = path.resolve("config", "accounts.local.json");
  const accountsTemplatePath = path.resolve("config", "accounts.template.json");
  const sourcePath = fs.existsSync(accountsPath) ? accountsPath : accountsTemplatePath;
  const accounts = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as Record<string, { mobileNumber: string; otp: string }>;
  const selectedAccount = accounts[selectedEnv];
  if (!selectedAccount) {
    throw new Error(`Missing credentials for "${selectedEnv}" in ${sourcePath}.`);
  }

  return {
    envName: selectedEnv,
    baseUrl: availableEnv.baseUrl,
    activeProjectName: availableEnv.activeProjectName,
    mobileNumber: selectedAccount.mobileNumber,
    otp: selectedAccount.otp,
    users,
    leads
  };
}
