/**
 * Account security rules, taken from the official requirements sheet.
 * Change values here only if the sheet changes.
 */
export const AUTH_RULES = {
  // ACC-01: at least 8 characters, at least one letter and one digit
  passwordMinLength: 8,
  passwordMaxLength: 64,
  passwordPattern: /^(?=.*[A-Za-z])(?=.*\d).+$/,
  passwordMessage: 'Password must be at least 8 characters and include at least one letter and one digit',

  // ACC-05: 5 consecutive failures lock the account for 15 minutes
  maxFailedLogins: 5,
  lockoutMinutes: 15,

  // ACC-06: a session with no authenticated request for 30 minutes expires
  sessionIdleMinutes: 30,
  // short-lived access token, renewed from the refresh token while the session is active
  accessTokenTtl: '15m' as const,
  // hard upper limit for a refresh token, even if the user stays active
  sessionMaxDays: 7,
};

/** '15m' / '1h' / '7d' / '3600' (seconds) → milliseconds. */
export function durationToMs(value: string | undefined, fallbackMs = 15 * 60 * 1000): number {
  if (!value) return fallbackMs;
  const m = /^(\d+)\s*([smhd]?)$/.exec(value.trim());
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, '': 1e3 }[m[2] as 's' | 'm' | 'h' | 'd' | ''];
  return n * unit;
}
