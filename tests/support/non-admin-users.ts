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

export function getReceptionFormNonAdminUser(envName: string): NonAdminUser {
  const user = nonAdminUsersByEnv[envName.toLowerCase()];
  if (!user) {
    throw new Error(`Missing reception form non-admin user for "${envName}".`);
  }

  return user;
}
