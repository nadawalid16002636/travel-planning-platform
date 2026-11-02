/**
 * Account security rules (ACC-03, ACC-05).
 * TODO P1: check every value against the official Excel requirements sheet.
 */
export const AUTH_RULES = {
  passwordMinLength: 8,
  passwordMaxLength: 64,
  // at least one lowercase, one uppercase, one digit and one special character
  passwordPattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/,
  passwordMessage:
    'Password must be 8-64 characters and include an uppercase letter, a lowercase letter, a number and a special character',
  maxFailedLogins: 5,
  lockoutMinutes: 15,
};

/** '1h' / '30m' / '7d' / '3600' (seconds) → milliseconds, for the cookie maxAge. */
export function durationToMs(value: string | undefined, fallbackMs = 60 * 60 * 1000): number {
  if (!value) return fallbackMs;
  const m = /^(\d+)\s*([smhd]?)$/.exec(value.trim());
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, '': 1e3 }[m[2] as 's' | 'm' | 'h' | 'd' | ''];
  return n * unit;
}
