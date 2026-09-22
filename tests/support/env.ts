import fs from "node:fs";
import path from "node:path";
import environments from "../../config/environments.json";
import users from "../data/users.json";
import leads from "../data/leads.json";

type EnvConfig = {
  envName: string;
  baseUrl: string;
  martechBaseUrl?: string;
  organisationId: string;
  receptionFormsOrgId?: string;
  receptionFormsProjectName?: string;
  receptionFormsProjectId?: string;
  activeProjectName: string;
  mobileNumber: string;
  otp: string;
  adminUser?: {
    email?: string;
    password?: string;
  };
  parallelUsers?: Array<Record<string, string>>;
  users: typeof users;
  leads: typeof leads;
};

function ensureConfiguredCredential(envName: string, label: string, value?: string) {
  const normalized = (value || "").trim();
  if (!normalized) {
    throw new Error(`Missing ${label} for "${envName}" in config/accounts.local.json.`);
  }

  if (/^confirm-/i.test(normalized)) {
    throw new Error(
      `Placeholder ${label} for "${envName}" is still set to "${normalized}" in config/accounts.local.json. ` +
      `Replace it with the real ${label} before running tests.`
    );
  }
}

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
  const accounts = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as Record<
    string,
    {
      mobileNumber: string;
      otp: string;
      adminUser?: {
        email?: string;
        password?: string;
      };
      parallelUsers?: Array<Record<string, string>>;
    }
  >;
  const selectedAccount = accounts[selectedEnv];
  if (!selectedAccount) {
    throw new Error(`Missing credentials for "${selectedEnv}" in ${sourcePath}.`);
  }

  const selectedMobileNumber = process.env.APP_TEST_MOBILE_NUMBER || process.env.APP_TEST_LOGIN_ID || selectedAccount.mobileNumber;
  const selectedOtp = process.env.APP_TEST_OTP || process.env.APP_TEST_PASSWORD || selectedAccount.otp;
  const selectedProjectName =
    process.env.APP_TEST_PROJECT_NAME ||
    process.env.ACTIVE_PROJECT_NAME ||
    availableEnv.activeProjectName;
  const selectedOrganisationId =
    process.env.APP_TEST_ORG_ID ||
    process.env.ACTIVE_ORG_ID ||
    availableEnv.organisationId;
  const selectedReceptionFormsProjectName =
    process.env.RECEPTION_FORMS_PROJECT_NAME ||
    availableEnv.receptionFormsProjectName;
  const selectedReceptionFormsOrgId =
    process.env.RECEPTION_FORMS_ORG_ID ||
    availableEnv.receptionFormsOrgId;
  const selectedReceptionFormsProjectId =
    process.env.RECEPTION_FORMS_PROJECT_ID ||
    availableEnv.receptionFormsProjectId;
  ensureConfiguredCredential(selectedEnv, "mobileNumber", selectedMobileNumber);
  ensureConfiguredCredential(selectedEnv, "otp", selectedOtp);
  ensureConfiguredCredential(selectedEnv, "organisationId", selectedOrganisationId);

  return {
    envName: selectedEnv,
    baseUrl: availableEnv.baseUrl,
    martechBaseUrl: availableEnv.martechBaseUrl,
    organisationId: selectedOrganisationId,
    receptionFormsOrgId: selectedReceptionFormsOrgId,
    receptionFormsProjectName: selectedReceptionFormsProjectName,
    receptionFormsProjectId: selectedReceptionFormsProjectId,
    activeProjectName: selectedProjectName,
    mobileNumber: selectedMobileNumber,
    otp: selectedOtp,
    adminUser: selectedAccount.adminUser,
    parallelUsers: selectedAccount.parallelUsers,
    users,
    leads
  };
}
