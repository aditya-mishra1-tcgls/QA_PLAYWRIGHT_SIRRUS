export type NonAdminUser = {
  mobileNumber: string;
  otp: string;
};

const nonAdminUsersByEnv: Record<string, NonAdminUser> = {
  qa: {
    mobileNumber: "8448618651",
    otp: "1234",
  },
  uat: {
    mobileNumber: "8448618651",
    otp: "1234",
  },
};

const unauthorizedChannelPartnerUsersByEnv: Record<string, NonAdminUser> = {
  qa: {
    mobileNumber: "9090909090",
    otp: "1234",
  },
  uat: {
    mobileNumber: "9090909090",
    otp: "1234",
  },
};

export function getReceptionFormNonAdminUser(envName: string): NonAdminUser {
  const user = nonAdminUsersByEnv[envName.toLowerCase()];
  if (!user) {
    throw new Error(`Missing reception form non-admin user for "${envName}".`);
  }

  return user;
}

export function getUnauthorizedChannelPartnerUser(envName: string): NonAdminUser {
  const user = unauthorizedChannelPartnerUsersByEnv[envName.toLowerCase()];
  if (!user) {
    throw new Error(`Missing unauthorized channel partner user for "${envName}".`);
  }

  return user;
}

export function getUnauthorizedUserManagementUser(envName: string): NonAdminUser {
  const user = unauthorizedChannelPartnerUsersByEnv[envName.toLowerCase()];
  if (!user) {
    throw new Error(`Missing unauthorized user management user for "${envName}".`);
  }

  return user;
}
