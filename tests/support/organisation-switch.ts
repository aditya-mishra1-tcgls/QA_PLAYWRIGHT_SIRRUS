import fs from "node:fs";
import { request } from "@playwright/test";
import { getAuthStatePath } from "./auth";

type AppConfig = {
  envName: string;
  baseUrl: string;
  receptionFormsOrgId?: string;
};

type StorageState = {
  cookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  }>;
  origins?: Array<{
    origin: string;
    localStorage?: Array<{
      name: string;
      value: string;
    }>;
  }>;
};

type TokenPayload = {
  sub: string;
  orgId: string;
};

type SwitchOrganisationResponse = {
  data?: {
    accessToken?: string;
    refreshToken?: string;
  };
  message?: string;
};

export function receptionFormsOrgId(app: AppConfig) {
  const orgId = process.env.RECEPTION_FORMS_ORG_ID || app.receptionFormsOrgId;
  if (!orgId) {
    throw new Error(`Missing receptionFormsOrgId for "${app.envName}" in config/environments.json.`);
  }

  return orgId;
}

export async function switchSavedAuthStateToReceptionFormsOrg(app: AppConfig) {
  return await switchSavedAuthStateOrganisation(app, receptionFormsOrgId(app));
}

export async function switchSavedAuthStateOrganisation(app: AppConfig, targetOrgId: string) {
  const authStatePath = getAuthStatePath(app.envName);
  const state = readStorageState(authStatePath);
  const origin = storageOrigin(state, app.baseUrl);
  const localStorage = localStorageMap(origin);
  const currentAccessToken = requiredLocalStorageValue(localStorage, "@auth", authStatePath);
  const currentRefreshToken = requiredLocalStorageValue(localStorage, "@refreshToken", authStatePath);
  const currentPayload = decodeJwtPayload(currentAccessToken);

  if (currentPayload.orgId === targetOrgId) {
    return currentPayload.orgId;
  }

  const nextTokens = await switchOrganisation({
    baseUrl: app.baseUrl,
    accessToken: currentAccessToken,
    refreshToken: currentRefreshToken,
    orgId: targetOrgId,
    userHash: currentPayload.sub,
  });

  updateStorageStateTokens(state, origin.origin, targetOrgId, nextTokens.accessToken, nextTokens.refreshToken);
  fs.writeFileSync(authStatePath, `${JSON.stringify(state, null, 2)}\n`);

  return currentPayload.orgId;
}

function readStorageState(authStatePath: string): StorageState {
  if (!fs.existsSync(authStatePath)) {
    throw new Error(`Authentication state was not found at ${authStatePath}. Run the setup project first.`);
  }

  return JSON.parse(fs.readFileSync(authStatePath, "utf8")) as StorageState;
}

function storageOrigin(state: StorageState, baseUrl: string) {
  const expectedOrigin = new URL(baseUrl).origin;
  const origin = state.origins?.find((candidate) => candidate.origin === expectedOrigin);
  if (!origin) {
    throw new Error(`Authentication state does not contain local storage for ${expectedOrigin}.`);
  }

  origin.localStorage ||= [];
  return origin;
}

function localStorageMap(origin: NonNullable<StorageState["origins"]>[number]) {
  return new Map((origin.localStorage || []).map((entry) => [entry.name, entry.value]));
}

function requiredLocalStorageValue(values: Map<string, string>, key: string, sourcePath: string) {
  const value = values.get(key);
  if (!value) {
    throw new Error(`Authentication state ${sourcePath} is missing localStorage key ${key}.`);
  }

  return value;
}

function decodeJwtPayload(token: string): TokenPayload {
  const payload = token.split(".")[1];
  if (!payload) {
    throw new Error("Access token was not a valid JWT.");
  }

  const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()) as TokenPayload;
  if (!decoded.sub || !decoded.orgId) {
    throw new Error("Access token did not include user hash and organisation id.");
  }

  return decoded;
}

async function switchOrganisation(input: {
  baseUrl: string;
  accessToken: string;
  refreshToken: string;
  orgId: string;
  userHash: string;
}) {
  const baseUrl = new URL(input.baseUrl).origin;
  const apiContext = await request.newContext({
    baseURL: baseUrl,
    extraHTTPHeaders: {
      accept: "application/json",
      application_platform: "TCG-DXP-WEB",
      authorization: `Bearer ${input.accessToken}`,
      client_id: "TCG-WEB-APP",
      "content-type": "application/json",
      origin: baseUrl,
      referer: `${baseUrl}/admin/developer/user-profile`,
      refreshtoken: input.refreshToken,
    },
  });

  try {
    const response = await apiContext.post("/api/authorization-service/v2/switch-organisation", {
      data: {
        orgId: input.orgId,
        userHash: input.userHash,
      },
    });
    const bodyText = await response.text();
    if (!response.ok()) {
      throw new Error(`Switch organisation failed with ${response.status()} ${response.statusText()}: ${bodyText}`);
    }

    const body = JSON.parse(bodyText) as SwitchOrganisationResponse;
    const accessToken = body.data?.accessToken;
    const refreshToken = body.data?.refreshToken;
    if (!accessToken || !refreshToken) {
      throw new Error(`Switch organisation response did not include access and refresh tokens: ${bodyText}`);
    }

    return { accessToken, refreshToken };
  } finally {
    await apiContext.dispose();
  }
}

function updateStorageStateTokens(
  state: StorageState,
  originUrl: string,
  orgId: string,
  accessToken: string,
  refreshToken: string,
) {
  const origin = state.origins?.find((candidate) => candidate.origin === originUrl);
  if (!origin) {
    throw new Error(`Authentication state does not contain local storage for ${originUrl}.`);
  }

  setLocalStorageValue(origin, "@auth", accessToken);
  setLocalStorageValue(origin, "@refreshToken", refreshToken);
  setLocalStorageValue(origin, "@slug", `/organisations/${orgId}`);

  const authCookie = state.cookies?.find((cookie) => cookie.name === "@auth");
  if (authCookie) {
    authCookie.value = accessToken;
  }
}

function setLocalStorageValue(
  origin: NonNullable<StorageState["origins"]>[number],
  key: string,
  value: string,
) {
  origin.localStorage ||= [];
  const existing = origin.localStorage.find((entry) => entry.name === key);
  if (existing) {
    existing.value = value;
    return;
  }

  origin.localStorage.push({ name: key, value });
}
