import { google } from "googleapis";

// ============================================================
// Required env vars for Sample Accounting Google connectors
// ============================================================
const REQUIRED_ENV_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
] as const;

/**
 * Validates that all required Google OAuth env vars are present.
 * Throws a descriptive error on first missing variable.
 */
function assertEnvVars(): void {
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      throw new Error(
        `[sample-accounting] Missing required environment variable: ${key}. ` +
          `Check trigger/.env.example for the full list.`
      );
    }
  }
}

/**
 * Creates an authenticated Google OAuth2 client using environment variables.
 * Call this at the start of any Google API operation.
 */
export function getGoogleAuthClient(): InstanceType<typeof google.auth.OAuth2> {
  assertEnvVars();

  const client = new google.auth.OAuth2(
    process.env["GOOGLE_CLIENT_ID"],
    process.env["GOOGLE_CLIENT_SECRET"]
  );

  client.setCredentials({
    refresh_token: process.env["GOOGLE_REFRESH_TOKEN"],
  });

  return client;
}

// ============================================================
// Named constants from env (validated at call-time, not import-time)
// ============================================================

// NOTE: getDriveFolderId() was removed — Drive folder ID now comes from
// facturas.noxx_clients.drive_folder_id (sample-client-registry change, S5.1, S5.6).

/** Gmail address used as the source mailbox */
export function getGmailUser(): string {
  const user = process.env["GMAIL_USER"];
  if (!user) {
    throw new Error(
      "[sample-accounting] Missing required environment variable: GMAIL_USER"
    );
  }
  return user;
}
